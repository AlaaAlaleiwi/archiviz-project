const { app, BrowserWindow, Menu, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const pty = require("node-pty");

let win;
const terminals = new Map();

const isDev = !app.isPackaged;

function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function getShellCandidates() {
  if (process.platform === "win32") {
    return [
      process.env.ComSpec,
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      "C:\\Windows\\System32\\cmd.exe",
    ].filter(Boolean);
  }

  return [
    process.env.SHELL,
    "/bin/zsh",
    "/bin/bash",
    "/bin/sh",
  ].filter(Boolean);
}

function getTerminalCwd(requestedCwd) {
  if (requestedCwd && fs.existsSync(requestedCwd)) return requestedCwd;
  if (process.cwd() && fs.existsSync(process.cwd())) return process.cwd();
  return os.homedir();
}

function sanitizeProjectName(name) {
  return String(name || "archiviz-project")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "archiviz-project";
}

function safeWriteWorkspaceFile(rootDir, filePath, content) {
  const normalizedPath = String(filePath || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalizedPath || normalizedPath.includes("..")) {
    throw new Error(`Unsafe workspace path: ${filePath}`);
  }

  const targetPath = path.resolve(rootDir, normalizedPath);
  const relativePath = path.relative(rootDir, targetPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Workspace path escaped run directory: ${filePath}`);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, String(content ?? ""), "utf-8");
}

function ensureNodePtyHelperExecutable() {
  if (process.platform === "win32") return;

  try {
    const nodePtyEntry = require.resolve("node-pty/lib/unixTerminal.js");
    const helperPath = path.resolve(
      path.dirname(nodePtyEntry),
      "../prebuilds",
      `${process.platform}-${process.arch}`,
      "spawn-helper"
    );

    if (fs.existsSync(helperPath)) {
      fs.chmodSync(helperPath, 0o755);
    }
  } catch (error) {
    console.warn("[terminal] Could not prepare node-pty spawn-helper:", error);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(__dirname, "../build/icon.png"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  setupMenu();
}

/* ─────────────────────────────
   MENU BAR
───────────────────────────── */
function setupMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "New Project",
          accelerator: "CmdOrCtrl+N",
          click: () => win.webContents.send("menu:new-project"),
        },
        {
          label: "Save Project",
          accelerator: "CmdOrCtrl+S",
          click: () => win.webContents.send("menu:save-project"),
        },
        {
          type: "separator",
        },
        {
          label: "Export Project",
          click: async () => {
            const result = await dialog.showSaveDialog(win, {
              title: "Export Project",
              defaultPath: "project.arch.json",
            });

            if (!result.canceled) {
              win.webContents.send("menu:export-project", result.filePath);
            }
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      role: "editMenu",
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/* ─────────────────────────────
   IPC (TERMINAL)
───────────────────────────── */
ipcMain.handle("terminal:create", async (_event, options = {}) => {
  ensureNodePtyHelperExecutable();

  const id = Math.random().toString(36).slice(2, 10);
  const cwd = getTerminalCwd(options.cwd);
  const cols = Number(options.cols) || 80;
  const rows = Number(options.rows) || 24;
  const candidates = getShellCandidates();
  let term = null;
  let shell = null;
  let lastError = null;

  for (const candidate of candidates) {
    const shellPath = path.isAbsolute(candidate) ? candidate : candidate;
    if (path.isAbsolute(shellPath) && !fileExists(shellPath)) continue;

    try {
      term = pty.spawn(shellPath, [], {
        name: "xterm-256color",
        cols,
        rows,
        cwd,
        env: {
          ...process.env,
          SHELL: shellPath,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
          PATH: process.env.PATH || "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin",
        },
      });
      shell = shellPath;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!term || !shell) {
    throw new Error(`Could not start terminal shell. Tried: ${candidates.join(", ")}. ${lastError?.message ?? ""}`.trim());
  }

  terminals.set(id, term);

  term.onData((data) => {
    win?.webContents.send("terminal:data", { id, data });
  });

  term.onExit(({ exitCode, signal }) => {
    terminals.delete(id);
    win?.webContents.send("terminal:exit", { id, exitCode, signal });
  });

  return { id, shell: path.basename(shell), cwd: cwd.replace(os.homedir(), "~") };
});

ipcMain.on("terminal:write", (_event, { id, data }) => {
  terminals.get(id)?.write(data);
});

ipcMain.on("terminal:resize", (_event, { id, cols, rows }) => {
  if (!cols || !rows) return;
  terminals.get(id)?.resize(cols, rows);
});

ipcMain.on("terminal:kill", (_event, id) => {
  const term = terminals.get(id);
  if (!term) return;
  term.kill();
  terminals.delete(id);
});

/* ─────────────────────────────
   IPC (WORKSPACE RUNNER)
───────────────────────────── */
ipcMain.handle("workspace:materialize", async (_event, options = {}) => {
  const files = Array.isArray(options.files) ? options.files : [];
  if (files.length === 0) {
    throw new Error("No project files are available to build or run.");
  }

  const rootDir = path.join(
    app.getPath("userData"),
    "run-workspaces",
    sanitizeProjectName(options.projectName)
  );

  fs.rmSync(rootDir, { recursive: true, force: true });
  fs.mkdirSync(rootDir, { recursive: true });

  for (const file of files) {
    if (!file || typeof file.path !== "string") continue;
    safeWriteWorkspaceFile(rootDir, file.path, file.content);
  }

  return { cwd: rootDir, displayPath: rootDir.replace(os.homedir(), "~") };
});

/* ─────────────────────────────
   IPC (SAVE FILE)
───────────────────────────── */
ipcMain.handle("save-project", async (event, data, filePath) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  return true;
});

/* ─────────────────────────────
   APP LIFECYCLE
───────────────────────────── */
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  for (const term of terminals.values()) term.kill();
  terminals.clear();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
