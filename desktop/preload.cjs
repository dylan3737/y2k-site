// The page's only way out of its sandbox: a small, fixed API.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

function listen(channel) {
  return (fn) => {
    const handler = (_event, data) => fn(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld('companion', {
  desktop: true,
  state: () => ipcRenderer.invoke('state'),
  save: (patch) => ipcRenderer.send('save', patch),
  stat: (key, n = 1) => ipcRenderer.send('stat', { key, n }),
  interactive: (on) => ipcRenderer.send('interactive', !!on),
  focus: (on) => ipcRenderer.send('focus', !!on),
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  capture: () => ipcRenderer.invoke('capture'),
  trash: (paths) => ipcRenderer.invoke('trash', paths),
  pathForFile: (file) => webUtils.getPathForFile(file),
  setAbilities: (list) => ipcRenderer.send('abilities', list),
  menu: () => ipcRenderer.send('menu'),
  speak: (text) => ipcRenderer.send('speak', text),
  speakStop: () => ipcRenderer.send('speak-stop'),
  speakForget: () => ipcRenderer.send('speak-forget'),
  setKey: (key) => ipcRenderer.invoke('set-key', key),
  toolResult: (id, outcome) => ipcRenderer.send('tool-result', { id, outcome }),
  onCursor: listen('cursor'),
  onAway: listen('away'),
  onCommand: listen('command'),
  onSettings: listen('settings'),
  onSpeech: listen('speech'),
  onToolCall: listen('tool-call')
});
