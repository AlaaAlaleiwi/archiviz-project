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
});