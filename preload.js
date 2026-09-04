const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mp', {
  ping: host => ipcRenderer.invoke('ping:run', host),
  getVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  onUpdateStatus: callback => {
    ipcRenderer.on('update:status', (_event, status) => callback(status))
  }
})
