'use strict';
// Pont minimal et typé entre l'interface et le système de fichiers.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('mixlabNative', {
  platform: process.platform,
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  readFile: p => ipcRenderer.invoke('read-file', p),
  exists: p => ipcRenderer.invoke('exists', p),
  // Chemin réel d'un fichier glissé depuis l'explorateur.
  droppedPath: async file => {
    const p = webUtils.getPathForFile(file);
    return p && (await ipcRenderer.invoke('allow-dropped', p)) ? p : null;
  },
  loadLibrary: () => ipcRenderer.invoke('library-load'),
  saveLibrary: json => ipcRenderer.invoke('library-save', json),
});
