use futures_util::StreamExt;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    env, fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

struct TerminalSession {
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
    writer: Box<dyn Write + Send>,
}

static WINDOW_COUNTER: AtomicU64 = AtomicU64::new(1);

struct TerminalState {
    next_id: AtomicU64,
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

impl Default for TerminalState {
    fn default() -> Self {
        Self {
            next_id: AtomicU64::new(1),
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalCreateOptions {
    cwd: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
    shell: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalCreateResult {
    id: String,
    shell: String,
    cwd: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalDataPayload {
    id: String,
    data: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TerminalExitPayload {
    id: String,
    exit_code: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitRunOptions {
    project_name: Option<String>,
    files: Option<Vec<ProjectFile>>,
    args: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceMaterializeOptions {
    project_name: Option<String>,
    files: Vec<ProjectFile>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceCommandOptions {
    project_name: Option<String>,
    files: Vec<ProjectFile>,
    program: String,
    args: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceMaterializeResult {
    cwd: String,
    display_path: String,
}

#[derive(Debug, Deserialize)]
struct ProjectFile {
    path: String,
    content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct GitRunResult {
    ok: bool,
    code: i32,
    stdout: String,
    stderr: String,
    command: String,
    cwd: String,
    display_path: String,
    is_repository: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceCommandResult {
    ok: bool,
    code: i32,
    stdout: String,
    stderr: String,
    command: String,
    cwd: String,
    display_path: String,
}

fn resolve_shell(requested: Option<String>) -> String {
    if let Some(shell) = requested {
        let trimmed = shell.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    if cfg!(windows) {
        env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".to_string())
    } else {
        env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
    }
}

fn resolve_cwd(requested: Option<String>) -> PathBuf {
    requested
        .filter(|cwd| !cwd.trim().is_empty())
        .map(PathBuf::from)
        .filter(|cwd| cwd.exists())
        .or_else(|| env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("."))
}

fn is_git_repository(cwd: &PathBuf) -> bool {
    Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(cwd)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn sanitize_project_name(name: Option<String>) -> String {
    let sanitized: String = name
        .unwrap_or_else(|| "archiviz-project".to_string())
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '.' || ch == '_' || ch == '-' {
                ch
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = sanitized.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "archiviz-project".to_string()
    } else {
        trimmed.chars().take(80).collect()
    }
}

fn clear_worktree(root: &Path) -> Result<(), String> {
    if !root.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(root).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        if entry.file_name() == ".git" {
            continue;
        }

        let path = entry.path();
        if path.is_dir() {
            fs::remove_dir_all(path).map_err(|error| error.to_string())?;
        } else {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

fn write_project_file(root: &Path, file: &ProjectFile) -> Result<(), String> {
    let normalized = file
        .path
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_string();
    if normalized.is_empty() || normalized.split('/').any(|part| part == "..") {
        return Err(format!("Unsafe workspace path: {}", file.path));
    }

    let target = root.join(&normalized);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&target, &file.content).map_err(|error| error.to_string())?;

    #[cfg(unix)]
    {
        if normalized == "gradlew" || normalized == "mvnw" {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(&target)
                .map_err(|error| error.to_string())?
                .permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&target, permissions).map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

fn prepare_git_workspace(
    app: &tauri::AppHandle,
    options: &GitRunOptions,
) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("git-workspaces")
        .join(sanitize_project_name(options.project_name.clone()));

    fs::create_dir_all(&root).map_err(|error| error.to_string())?;

    if let Some(files) = &options.files {
        clear_worktree(&root)?;
        for file in files {
            write_project_file(&root, file)?;
        }
    }

    Ok(root)
}

fn materialize_workspace(
    app: &tauri::AppHandle,
    project_name: Option<String>,
    files: &[ProjectFile],
) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("git-workspaces")
        .join(sanitize_project_name(project_name));

    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    clear_worktree(&root)?;
    for file in files {
        write_project_file(&root, file)?;
    }

    Ok(root)
}

#[tauri::command]
fn secret_set(name: String, value: String) -> Result<(), String> {
    let entry =
        keyring::Entry::new("com.archiviz.ide", &name).map_err(|error| error.to_string())?;
    entry
        .set_password(&value)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn secret_get(name: String) -> Result<String, String> {
    let entry =
        keyring::Entry::new("com.archiviz.ide", &name).map_err(|error| error.to_string())?;
    match entry.get_password() {
        Ok(value) => Ok(value),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn secret_delete(name: String) -> Result<(), String> {
    let entry =
        keyring::Entry::new("com.archiviz.ide", &name).map_err(|error| error.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn open_workspace_target(cwd: String, target: String) -> Result<(), String> {
    let path = PathBuf::from(&cwd);
    if !path.is_dir() {
        return Err("The project workspace is not available yet.".to_string());
    }

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        match target.as_str() {
            "vscode" => {
                command.args(["-a", "Visual Studio Code"]);
            }
            "intellij" => {
                command.args(["-a", "IntelliJ IDEA"]);
            }
            "terminal" => {
                command.args(["-a", "Terminal"]);
            }
            "files" => {}
            _ => return Err("Unsupported workspace target.".to_string()),
        }
        command.arg(&path);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("cmd");
        match target.as_str() {
            "vscode" => {
                command.args(["/C", "code"]);
            }
            "intellij" => {
                command.args(["/C", "idea"]);
            }
            "terminal" => {
                command.args(["/C", "start", "cmd", "/K", "cd", "/D"]);
            }
            "files" => {
                command.args(["/C", "start", ""]);
            }
            _ => return Err("Unsupported workspace target.".to_string()),
        }
        command.arg(&path);
        command
    };

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut command = {
        let mut command = match target.as_str() {
            "vscode" => Command::new("code"),
            "intellij" => Command::new("idea"),
            "terminal" => Command::new("x-terminal-emulator"),
            "files" => Command::new("xdg-open"),
            _ => return Err("Unsupported workspace target.".to_string()),
        };
        if target == "terminal" {
            command.current_dir(&path);
        } else {
            command.arg(&path);
        }
        command
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open {}: {}", target, error))
}

#[tauri::command]
fn workspace_target_availability() -> HashMap<String, bool> {
    let mut availability =
        HashMap::from([("files".to_string(), true), ("terminal".to_string(), true)]);

    #[cfg(target_os = "macos")]
    {
        let applications = Path::new("/Applications");
        availability.insert(
            "vscode".to_string(),
            applications.join("Visual Studio Code.app").exists(),
        );
        let intellij_available = fs::read_dir(applications)
            .ok()
            .into_iter()
            .flatten()
            .filter_map(Result::ok)
            .filter_map(|entry| entry.file_name().into_string().ok())
            .any(|name| name.starts_with("IntelliJ IDEA") && name.ends_with(".app"));
        availability.insert("intellij".to_string(), intellij_available);
    }

    #[cfg(target_os = "windows")]
    {
        let available = |program: &str| {
            Command::new("where")
                .arg(program)
                .output()
                .map(|output| output.status.success())
                .unwrap_or(false)
        };
        availability.insert("vscode".to_string(), available("code"));
        availability.insert("intellij".to_string(), available("idea"));
    }

    #[cfg(target_os = "linux")]
    {
        let available = |program: &str| {
            Command::new("sh")
                .args(["-c", &format!("command -v {program}")])
                .output()
                .map(|output| output.status.success())
                .unwrap_or(false)
        };
        availability.insert("vscode".to_string(), available("code"));
        availability.insert("intellij".to_string(), available("idea"));
        availability.insert("files".to_string(), available("xdg-open"));
        availability.insert("terminal".to_string(), available("x-terminal-emulator"));
    }

    availability
}

#[tauri::command]
fn workspace_materialize(
    app: tauri::AppHandle,
    options: WorkspaceMaterializeOptions,
) -> Result<WorkspaceMaterializeResult, String> {
    let cwd = materialize_workspace(&app, options.project_name, &options.files)?;
    let display_path = cwd
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_else(|| cwd.to_str().unwrap_or("."))
        .to_string();

    Ok(WorkspaceMaterializeResult {
        cwd: cwd.to_string_lossy().to_string(),
        display_path,
    })
}

#[tauri::command]
fn git_run(app: tauri::AppHandle, options: GitRunOptions) -> Result<GitRunResult, String> {
    let cwd = prepare_git_workspace(&app, &options)?;
    let output = Command::new("git")
        .args(options.args.iter().map(String::as_str))
        .current_dir(&cwd)
        .output()
        .map_err(|error| error.to_string())?;

    let code = output
        .status
        .code()
        .unwrap_or(if output.status.success() { 0 } else { 1 });
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let display_path = cwd
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_else(|| cwd.to_str().unwrap_or("."))
        .to_string();

    Ok(GitRunResult {
        ok: output.status.success(),
        code,
        stdout,
        stderr,
        command: format!("git {}", options.args.join(" ")),
        cwd: cwd.to_string_lossy().to_string(),
        display_path,
        is_repository: is_git_repository(&cwd),
    })
}

#[tauri::command]
fn workspace_command(
    app: tauri::AppHandle,
    options: WorkspaceCommandOptions,
) -> Result<WorkspaceCommandResult, String> {
    let cwd = materialize_workspace(&app, options.project_name, &options.files)?;
    let output = Command::new(&options.program)
        .args(options.args.iter().map(String::as_str))
        .current_dir(&cwd)
        .output()
        .map_err(|error| error.to_string())?;

    let code = output
        .status
        .code()
        .unwrap_or(if output.status.success() { 0 } else { 1 });
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let display_path = cwd
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_else(|| cwd.to_str().unwrap_or("."))
        .to_string();

    Ok(WorkspaceCommandResult {
        ok: output.status.success(),
        code,
        stdout,
        stderr,
        command: [vec![options.program], options.args].concat().join(" "),
        cwd: cwd.to_string_lossy().to_string(),
        display_path,
    })
}

#[tauri::command]
fn terminal_create(
    app: tauri::AppHandle,
    state: State<'_, TerminalState>,
    options: TerminalCreateOptions,
) -> Result<TerminalCreateResult, String> {
    let id = state.next_id.fetch_add(1, Ordering::Relaxed).to_string();
    let shell = resolve_shell(options.shell);
    let cwd = resolve_cwd(options.cwd);
    let cols = options.cols.unwrap_or(100).max(20);
    let rows = options.rows.unwrap_or(28).max(5);
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;

    let mut command = CommandBuilder::new(&shell);
    command.cwd(&cwd);
    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| error.to_string())?;
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;
    let session = TerminalSession {
        master: pair.master,
        child,
        writer,
    };

    state
        .sessions
        .lock()
        .map_err(|_| "Terminal session store is unavailable.".to_string())?
        .insert(id.clone(), session);

    let read_id = id.clone();
    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let data = String::from_utf8_lossy(&buffer[..count]).to_string();
                    let _ = app.emit(
                        "terminal-data",
                        TerminalDataPayload {
                            id: read_id.clone(),
                            data,
                        },
                    );
                }
                Err(_) => break,
            }
        }

        let _ = app.emit(
            "terminal-exit",
            TerminalExitPayload {
                id: read_id,
                exit_code: None,
            },
        );
    });

    Ok(TerminalCreateResult {
        id,
        shell: PathBuf::from(&shell)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or(&shell)
            .to_string(),
        cwd: cwd.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn terminal_write(state: State<'_, TerminalState>, id: String, data: String) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Terminal session store is unavailable.".to_string())?;
    let session = sessions
        .get_mut(&id)
        .ok_or_else(|| "Terminal session not found.".to_string())?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|error| error.to_string())?;
    session.writer.flush().map_err(|error| error.to_string())
}

#[tauri::command]
fn terminal_resize(
    state: State<'_, TerminalState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| "Terminal session store is unavailable.".to_string())?;
    let session = sessions
        .get(&id)
        .ok_or_else(|| "Terminal session not found.".to_string())?;
    session
        .master
        .resize(PtySize {
            rows: rows.max(5),
            cols: cols.max(20),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn terminal_kill(state: State<'_, TerminalState>, id: String) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "Terminal session store is unavailable.".to_string())?;
    if let Some(mut session) = sessions.remove(&id) {
        session.child.kill().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_project_window(app: tauri::AppHandle, launch_token: String) -> Result<(), String> {
    let counter = WINDOW_COUNTER.fetch_add(1, Ordering::Relaxed);
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let label = format!("project-window-{}-{}", timestamp, counter);
    let launch_token_json =
        serde_json::to_string(&launch_token).map_err(|error| error.to_string())?;

    WebviewWindowBuilder::new(&app, label, WebviewUrl::default())
        .title("Archiviz")
        .inner_size(1200.0, 800.0)
        .resizable(true)
        .initialization_script(&format!(
            "window.__ARCHIVIZ_LAUNCH_TOKEN__ = {};",
            launch_token_json
        ))
        .build()
        .map_err(|error| error.to_string())?;

    Ok(())
}

// ── AI HTTP helpers (bypass WebView CORS) ─────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiFetchOptions {
    url: String,
    headers: HashMap<String, String>,
    body: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AiTokenEvent {
    request_id: String,
    data: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AiDoneEvent {
    request_id: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AiErrorEvent {
    request_id: String,
    error: String,
}

#[tauri::command]
async fn ai_fetch(options: AiFetchOptions) -> Result<String, String> {
    let client = reqwest::Client::new();
    let mut builder = client.post(&options.url);
    for (k, v) in &options.headers {
        builder = builder.header(k.as_str(), v.as_str());
    }
    let response = builder
        .body(options.body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, text));
    }
    response.text().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn ai_stream(
    app: tauri::AppHandle,
    options: AiFetchOptions,
    request_id: String,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let mut builder = client.post(&options.url);
    for (k, v) in &options.headers {
        builder = builder.header(k.as_str(), v.as_str());
    }
    let response = match builder.body(options.body).send().await {
        Ok(r) => r,
        Err(e) => {
            let _ = app.emit(
                "ai-error",
                AiErrorEvent {
                    request_id,
                    error: e.to_string(),
                },
            );
            return Ok(());
        }
    };
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let text = response.text().await.unwrap_or_default();
        let _ = app.emit(
            "ai-error",
            AiErrorEvent {
                request_id,
                error: format!("HTTP {}: {}", status, text),
            },
        );
        return Ok(());
    }
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    while let Some(chunk) = stream.next().await {
        let bytes = match chunk {
            Ok(b) => b,
            Err(e) => {
                let _ = app.emit(
                    "ai-error",
                    AiErrorEvent {
                        request_id,
                        error: e.to_string(),
                    },
                );
                return Ok(());
            }
        };
        buffer.push_str(&String::from_utf8_lossy(&bytes));
        loop {
            match buffer.find('\n') {
                None => break,
                Some(pos) => {
                    let line = buffer[..pos].trim().to_string();
                    buffer = buffer[pos + 1..].to_string();
                    if let Some(data) = line.strip_prefix("data:") {
                        let data = data.trim();
                        if data == "[DONE]" {
                            let _ = app.emit(
                                "ai-done",
                                AiDoneEvent {
                                    request_id: request_id.clone(),
                                },
                            );
                            return Ok(());
                        }
                        if !data.is_empty() {
                            let _ = app.emit(
                                "ai-token",
                                AiTokenEvent {
                                    request_id: request_id.clone(),
                                    data: data.to_string(),
                                },
                            );
                        }
                    }
                }
            }
        }
    }
    let _ = app.emit("ai-done", AiDoneEvent { request_id });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(TerminalState::default())
        .invoke_handler(tauri::generate_handler![
            terminal_create,
            terminal_write,
            terminal_resize,
            terminal_kill,
            git_run,
            workspace_materialize,
            workspace_command,
            open_project_window,
            secret_get,
            secret_set,
            secret_delete,
            open_workspace_target,
            workspace_target_availability,
            ai_fetch,
            ai_stream
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
