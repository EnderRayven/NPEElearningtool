import { app, BrowserWindow, dialog, shell } from 'electron'
import { preview } from 'vite'
import { access, mkdir } from 'node:fs/promises'
import Module from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
  return `http://${DESKTOP_HOST}:${DESKTOP_PORT}`
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
