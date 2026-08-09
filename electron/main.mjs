import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import electronUpdater from 'electron-updater'
import { preview } from 'vite'
import { access, mkdir } from 'node:fs/promises'
import Module from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { autoUpdater } = electronUpdater
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const isDevelopment = !app.isPackaged
const DESKTOP_HOST = 'localhost'
const DESKTOP_PORT = 45217
const WORKSPACE_MANIFEST = '题库数据.json'
const WORKSPACE_GROUPS = ['数学', '英语', '专业课']
const runtimeConfigFile = isDevelopment
  ? path.join(projectRoot, 'vite.config.ts')
  : path.join(process.resourcesPath, 'app.asar.unpacked', 'vite.config.ts')
let previewServer
let mainWindow
const canAutoUpdate = !isDevelopment && (process.platform === 'darwin' || process.platform === 'win32')
let updaterState = {
  status: isDevelopment || !canAutoUpdate ? 'unsupported' : 'idle',
  version: '',
  releaseName: '',
  releaseNotes: '',
  releaseDate: '',
  progress: 0,
  error: '',
}

function releaseNotesText(value) {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value.map(item => {
    if (typeof item === 'string') return item
    if (!item || typeof item !== 'object') return ''
    return typeof item.note === 'string' ? item.note : typeof item.text === 'string' ? item.text : ''
  }).filter(Boolean).join('\n\n')
}

function updateInfoState(info = {}, extra = {}) {
  return {
    ...updaterState,
    ...extra,
    version: typeof info.version === 'string' ? info.version : updaterState.version,
    releaseName: typeof info.releaseName === 'string' ? info.releaseName : updaterState.releaseName,
    releaseNotes: releaseNotesText(info.releaseNotes) || updaterState.releaseNotes,
    releaseDate: info.releaseDate instanceof Date ? info.releaseDate.toISOString() : typeof info.releaseDate === 'string' ? info.releaseDate : updaterState.releaseDate,
  }
}

function publishUpdaterState(next) {
  updaterState = next
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('npee-update:state', updaterState)
}

function setUpdaterState(extra, info) {
  publishUpdaterState(info ? updateInfoState(info, extra) : { ...updaterState, ...extra })
}

function setupAutoUpdater() {
  if (!canAutoUpdate) return
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.on('checking-for-update', () => setUpdaterState({ status: 'checking', error: '', progress: 0 }))
  autoUpdater.on('update-available', info => setUpdaterState({ status: 'available', error: '', progress: 0 }, info))
  autoUpdater.on('update-not-available', info => setUpdaterState({ status: 'not-available', error: '', progress: 0 }, info))
  autoUpdater.on('download-progress', progress => setUpdaterState({ status: 'downloading', error: '', progress: Math.max(0, Math.min(1, Number(progress.percent || 0) / 100)) }))
  autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName, releaseDate) => setUpdaterState({ status: 'downloaded', error: '', progress: 1 }, { version: updaterState.version, releaseNotes, releaseName, releaseDate }))
  autoUpdater.on('error', error => setUpdaterState({ status: 'error', error: error instanceof Error ? error.message : String(error), progress: 0 }))
}

ipcMain.handle('npee-update:get-state', () => updaterState)
ipcMain.handle('npee-update:check', async () => {
  if (!canAutoUpdate) return updaterState
  try {
    setUpdaterState({ status: 'checking', error: '', progress: 0 })
    await autoUpdater.checkForUpdates()
  } catch (error) {
    setUpdaterState({ status: 'error', error: error instanceof Error ? error.message : String(error), progress: 0 })
  }
  return updaterState
})
ipcMain.handle('npee-update:download', async () => {
  if (!canAutoUpdate) return updaterState
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    setUpdaterState({ status: 'error', error: error instanceof Error ? error.message : String(error), progress: 0 })
  }
  return updaterState
})
ipcMain.handle('npee-update:install', () => {
  if (canAutoUpdate && updaterState.status === 'downloaded') autoUpdater.quitAndInstall()
  return updaterState
})

function configurePackagedModuleResolution() {
  if (isDevelopment) return
  const packagedNodeModules = path.join(process.resourcesPath, 'app.asar', 'node_modules')
  const currentNodePath = process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : []
  if (!currentNodePath.includes(packagedNodeModules)) {
    process.env.NODE_PATH = [packagedNodeModules, ...currentNodePath].filter(Boolean).join(path.delimiter)
    Module._initPaths()
  }
}

async function pathExists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

async function isUsableDataRoot(candidate) {
  const workspaceRoot = path.join(candidate, '默认题库')
  if (!await pathExists(path.join(workspaceRoot, WORKSPACE_MANIFEST))) return false
  const groupResults = await Promise.all(WORKSPACE_GROUPS.map(group => pathExists(path.join(workspaceRoot, group))))
  return groupResults.some(Boolean)
}

async function findAvailableDataRoot() {
  const bundledOrPortableCandidates = [
    process.env.NPEE_DATA_ROOT,
    isDevelopment ? path.join(projectRoot, '数据') : null,
    path.join(path.dirname(process.execPath), '数据'),
    path.resolve(path.dirname(process.execPath), '../../../数据'),
    path.join(process.cwd(), '数据'),
    path.join(app.getPath('documents'), '考研学习空间', '数据'),
  ].filter(Boolean)

  for (const candidate of bundledOrPortableCandidates) {
    const resolved = path.resolve(candidate)
    if (process.env.NPEE_DATA_ROOT === candidate && await pathExists(resolved)) return resolved
    if (await isUsableDataRoot(resolved)) return resolved
  }

  return path.resolve(app.getPath('documents'), '考研学习空间', '数据')
}

async function startPreviewServer() {
  configurePackagedModuleResolution()
  process.env.NPEE_BUILD_ROOT = isDevelopment ? path.join(projectRoot, '构建') : projectRoot
  const dataRoot = await findAvailableDataRoot()
  const workspaceRoot = path.join(dataRoot, '默认题库')
  const userDataRoot = path.join(dataRoot, '用户数据')
  await mkdir(dataRoot, { recursive: true })
  await mkdir(workspaceRoot, { recursive: true })
  await mkdir(userDataRoot, { recursive: true })

  process.env.NPEE_DATA_ROOT = dataRoot
  process.env.NPEE_WORKSPACE_ROOT = workspaceRoot
  process.env.NPEE_USER_DATA_ROOT = userDataRoot

  previewServer = await preview({
    root: projectRoot,
    configFile: runtimeConfigFile,
    preview: { host: DESKTOP_HOST, port: DESKTOP_PORT, strictPort: true },
  })
  return `http://localhost:${DESKTOP_PORT}`
}

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#f8f6f2',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.on('did-finish-load', () => publishUpdaterState(updaterState))
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//i.test(target)) void shell.openExternal(target)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(url)) {
      event.preventDefault()
      if (/^https?:\/\//i.test(target)) void shell.openExternal(target)
    }
  })
  void mainWindow.loadURL(url)
}

async function closePreviewServer() {
  if (!previewServer?.httpServer) return
  await new Promise(resolve => previewServer.httpServer.close(() => resolve()))
  previewServer = undefined
}

const hasSingleInstance = app.requestSingleInstanceLock()
if (!hasSingleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.enderrayven.npee-study-space')
    setupAutoUpdater()
    const url = await startPreviewServer()
    createMainWindow(url)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow(url)
    })
  }).catch(error => {
    console.error('Electron 启动失败', error)
    void dialog.showMessageBox({
      type: 'error',
      title: 'NPEE Study Space failed to start',
      message: 'The desktop app failed to start.',
      detail: error instanceof Error ? error.message : String(error),
    }).finally(() => app.quit())
  })

  app.on('before-quit', () => { void closePreviewServer() })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
