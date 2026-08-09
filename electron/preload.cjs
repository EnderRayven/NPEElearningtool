const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('npeeDesktop', {
  isDesktop: true,
  platform: process.platform,
  getUpdateState: () => require('electron').ipcRenderer.invoke('npee-update:get-state'),
  checkForUpdates: () => require('electron').ipcRenderer.invoke('npee-update:check'),
  downloadUpdate: () => require('electron').ipcRenderer.invoke('npee-update:download'),
  installUpdate: () => require('electron').ipcRenderer.invoke('npee-update:install'),
  onUpdateState: listener => {
    const { ipcRenderer } = require('electron')
    const handler = (_event, state) => listener(state)
    ipcRenderer.on('npee-update:state', handler)
    return () => ipcRenderer.removeListener('npee-update:state', handler)
  },
})
