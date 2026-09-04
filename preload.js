const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mp', {
  getVersion: () => ipcRenderer.invoke('app:version'),
  openExternal: url => ipcRenderer.invoke('shell:open', url),

  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    onState: cb => ipcRenderer.on('window:state', (_e, maximized) => cb(maximized))
  },

  onStartupStatus: cb => ipcRenderer.on('startup:status', (_e, status) => cb(status)),

  ping: host => ipcRenderer.invoke('ping:run', host),
  specs: () => ipcRenderer.invoke('specs:get'),
  hardware: () => ipcRenderer.invoke('hardware:status'),

  fans: {
    read: () => ipcRenderer.invoke('fans:read'),
    write: curves => ipcRenderer.invoke('fans:write', curves)
  },
  fivem: code => ipcRenderer.invoke('fivem:lookup', code),

  updates: {
    scan: () => ipcRenderer.invoke('updates:scan'),
    install: ids => ipcRenderer.invoke('updates:install', ids),
    progress: () => ipcRenderer.invoke('updates:progress')
  }
})
