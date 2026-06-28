const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('jarvis', {
  sendCommand: (text) => ipcRenderer.send('jarvis:command', text),
  stop: () => ipcRenderer.send('jarvis:stop'),
  reset: () => ipcRenderer.send('jarvis:reset'),
  resolvePermission: (toolUseID, allow) =>
    ipcRenderer.send('jarvis:permission-response', { toolUseID, allow }),
  onEvent: (callback) => subscribe('jarvis:event', callback),
  onPermissionRequest: (callback) => subscribe('jarvis:permission-request', callback),
  onStatus: (callback) => subscribe('jarvis:status', callback),
  startVoice: (lang) => ipcRenderer.send('jarvis:voice-start', lang),
  stopVoice: () => ipcRenderer.send('jarvis:voice-stop'),
  onVoiceEvent: (callback) => subscribe('jarvis:voice-event', callback),
  speak: (text) => ipcRenderer.send('jarvis:speak', text),
  speakStop: () => ipcRenderer.send('jarvis:speak-stop'),
  // CWD
  getCwd: () => ipcRenderer.invoke('jarvis:get-cwd'),
  setCwd: (p) => ipcRenderer.invoke('jarvis:set-cwd', p),
  listProjects: () => ipcRenderer.invoke('jarvis:list-projects'),
  openDirPicker: () => ipcRenderer.invoke('jarvis:open-dir-picker'),
});
