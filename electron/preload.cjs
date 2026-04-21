const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  saveProject: (data, filePath) =>
    ipcRenderer.invoke("save-project", data, filePath),

  onMenuSave: (callback) =>
    ipcRenderer.on("menu:save-project", callback),

  onMenuNew: (callback) =>
    ipcRenderer.on("menu:new-project", callback),

  onMenuExport: (callback) =>
    ipcRenderer.on("menu:export-project", (_, filePath) =>
      callback(filePath)
    ),

  createTerminal: (options) =>
    ipcRenderer.invoke("terminal:create", options),

  writeTerminal: (id, data) =>
    ipcRenderer.send("terminal:write", { id, data }),

  resizeTerminal: (id, cols, rows) =>
    ipcRenderer.send("terminal:resize", { id, cols, rows }),

  killTerminal: (id) =>
    ipcRenderer.send("terminal:kill", id),

  materializeWorkspace: (options) =>
    ipcRenderer.invoke("workspace:materialize", options),

  onTerminalData: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("terminal:data", listener);
    return () => ipcRenderer.removeListener("terminal:data", listener);
  },

  onTerminalExit: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("terminal:exit", listener);
    return () => ipcRenderer.removeListener("terminal:exit", listener);
  },
});
