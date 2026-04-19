const { app, BrowserWindow, Menu, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

let win;

const isDev = !app.isPackaged;

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
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});