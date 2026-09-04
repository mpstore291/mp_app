const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const { autoUpdater } = require('electron-updater')
const { ping } = require('./src/ping')
const { getSpecs } = require('./src/specs')
const { lookup } = require('./src/fivem')
const winupdate = require('./src/winupdate')

let win = null

function createWindow () {
  win = new BrowserWindow({
    width: 1060,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0d0f12',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Under udvikling er fejl i brugerfladen ellers usynlige uden at aabne DevTools.
  if (!app.isPackaged) {
    win.webContents.on('console-message', (_e, level, message, line, source) => {
      if (level >= 2) console.error(`[UI] ${message} (${source}:${line})`)
    })
    win.webContents.on('render-process-gone', (_e, details) => {
      console.error('[UI] processen stoppede:', details.reason)
    })
  }

  win.loadFile('index.html')
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => { win = null })

  // Bruges til at holde maksimer-knappen i sync med vinduets faktiske tilstand.
  const sendState = () => send('window:state', win.isMaximized())
  win.on('maximize', sendState)
  win.on('unmaximize', sendState)
}

function send (channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function splash (stage, text) {
  send('startup:status', { stage, text })
}

function setupUpdater () {
  // I udviklingstilstand findes der ingen installeret app at opdatere.
  if (!app.isPackaged) {
    setTimeout(() => splash('ready', 'Klar'), 1400)
    return
  }

  autoUpdater.autoDownload = true

  autoUpdater.on('checking-for-update', () => splash('checking', 'Søger efter opdateringer...'))
  autoUpdater.on('update-not-available', () => splash('ready', 'Du kører den nyeste version'))
  autoUpdater.on('update-available', info => splash('downloading', `Henter version ${info.version}...`))
  autoUpdater.on('download-progress', p => splash('downloading', `Henter opdatering... ${Math.round(p.percent)}%`))

  autoUpdater.on('update-downloaded', async info => {
    splash('installing', 'Opdatering klar')
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      buttons: ['Installer og genstart', 'Senere'],
      defaultId: 0,
      cancelId: 1,
      title: 'Opdatering klar',
      message: `MP_Functions ${info.version} er hentet.`,
      detail: 'Appen genstarter for at fuldføre installationen.'
    })
    if (response === 0) autoUpdater.quitAndInstall()
    else splash('ready', 'Opdatering installeres ved næste opstart')
  })

  autoUpdater.on('error', err => {
    splash('ready', 'Kunne ikke søge efter opdateringer')
    console.error('Opdateringsfejl:', err.message)
  })

  autoUpdater.checkForUpdates()
}

function registerHandlers () {
  ipcMain.handle('app:version', () => app.getVersion())

  ipcMain.on('window:minimize', () => win?.minimize())
  ipcMain.on('window:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
  ipcMain.on('window:close', () => win?.close())

  ipcMain.handle('ping:run', (_e, host) => ping(host))
  ipcMain.handle('specs:get', () => getSpecs())
  ipcMain.handle('fivem:lookup', (_e, code) => lookup(code))

  ipcMain.handle('updates:scan', () => winupdate.scan())
  ipcMain.handle('updates:install', (_e, ids) => winupdate.startInstall(ids))
  ipcMain.handle('updates:progress', () => winupdate.readProgress())

  ipcMain.handle('shell:open', (_e, url) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url)
  })
}

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
    registerHandlers()
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
