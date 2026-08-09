const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('npeeDesktop', {
  isDesktop: true,
  platform: process.platform,
})
