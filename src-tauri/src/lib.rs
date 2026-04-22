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
};
use tauri::{Emitter, Manager, State};

struct TerminalSession {
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
    writer: Box<dyn Write + Send>,
}

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
            workspace_command
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
