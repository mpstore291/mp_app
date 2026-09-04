const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { autoUpdater } = require('electron-updater')
const { ping } = require('./src/ping')

let win = null

function createWindow () {
  win = new BrowserWindow({
    width: 1000,
    height: 680,
    minWidth: 820,
    minHeight: 520,
    backgroundColor: '#1e2124',
    icon: path.join(__dirname, 'assets', 'icon-256.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.setMenuBarVisibility(false)
  win.loadFile('index.html')
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => { win = null })
}

function sendStatus (text) {
  if (win && !win.isDestroyed()) win.webContents.send('update:status', text)
}

function setupUpdater () {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = false

  autoUpdater.on('update-available', async info => {
    sendStatus(`Version ${info.version} er tilgængelig.`)
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Installer nu', 'Senere'],
      defaultId: 0,
      cancelId: 1,
      title: 'Opdatering tilgængelig',
      message: `MP_Functions ${info.version} er klar.`,
      detail: 'Vil du hente og installere opdateringen nu?'
    })
    if (response === 0) {
      sendStatus('Henter opdatering...')
      autoUpdater.downloadUpdate()
    }
  })

  autoUpdater.on('download-progress', p => {
    sendStatus(`Henter opdatering... ${Math.round(p.percent)}%`)
  })

  autoUpdater.on('update-downloaded', async () => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Genstart og installer', 'Senere'],
      defaultId: 0,
      cancelId: 1,
      title: 'Opdatering hentet',
      message: 'Opdateringen er klar til installation.',
      detail: 'MP_Functions genstarter for at fuldføre installationen.'
    })
    if (response === 0) autoUpdater.quitAndInstall()
  })

  autoUpdater.on('update-not-available', () => sendStatus('Du kører den nyeste version.'))
  autoUpdater.on('error', err => sendStatus(`Kunne ikke søge efter opdateringer: ${err.message}`))

  autoUpdater.checkForUpdates()
}

// Ligesom Discord: klikker man på genvejen igen, hentes det åbne vindue frem
// i stedet for at starte en ny kopi af appen.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    ipcMain.handle('ping:run', (_event, host) => ping(host))
    ipcMain.handle('app:version', () => app.getVersion())
    ipcMain.handle('update:check', () => {
      if (!app.isPackaged) return { checking: false, reason: 'Opdateringer virker kun i den installerede app.' }
      autoUpdater.checkForUpdates()
      return { checking: true }
    })

    createWindow()
    setupUpdater()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
