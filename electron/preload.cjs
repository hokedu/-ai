/**
 * Preload script for the main application window.
 * Exposes a minimal Electron API to the React renderer via contextBridge.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  /** Open the floating subtitle window. */
  openPip: () => ipcRenderer.send('open-pip'),

  /** Close the floating subtitle window. */
  closePip: () => ipcRenderer.send('close-pip'),

  /** Check if the PiP window is currently open. */
  isPipOpen: () => ipcRenderer.invoke('is-pip-open'),

  /** Listen for PiP window state changes. Returns cleanup function. */
  onPipClosed: (callback) => {
    ipcRenderer.on('pip-closed', callback);
    return () => ipcRenderer.removeListener('pip-closed', callback);
  },
});
