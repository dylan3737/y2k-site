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
  stat: (key, n = 1, worth) => ipcRenderer.send('stat', { key, n, worth }),
  crypt: (action) => ipcRenderer.invoke('crypt', action),
  cross: (through) => ipcRenderer.invoke('cross', through),
  interactive: (on) => ipcRenderer.send('interactive', !!on),
  focus: (on) => ipcRenderer.send('focus', !!on),
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  capture: (opts) => ipcRenderer.invoke('capture', opts),
  clipboardRead: () => ipcRenderer.invoke('clipboard-read'),
  clipboardWrite: (text) => ipcRenderer.send('clipboard-write', text),
  // Speak's reach: the web, apps and files. The page asks the user first for
  // anything that opens something or looks through their files.
  webSearch: (query) => ipcRenderer.invoke('web-search', query),
  webRead: (url) => ipcRenderer.invoke('web-read', url),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  openApp: (name) => ipcRenderer.invoke('open-app', name),
  findFiles: (query) => ipcRenderer.invoke('find-files', query),
  openFile: (file, reveal) => ipcRenderer.invoke('open-file', { file, reveal }),
  spotify: (input) => ipcRenderer.invoke('spotify', input),
  trash: (paths) => ipcRenderer.invoke('trash', paths),
  pathForFile: (file) => webUtils.getPathForFile(file),
  setAbilities: (list) => ipcRenderer.send('abilities', list),
  menu: () => ipcRenderer.send('menu'),
  speak: (text) => ipcRenderer.send('speak', text),
  speakStop: () => ipcRenderer.send('speak-stop'),
  speakForget: () => ipcRenderer.send('speak-forget'),
  setKey: (key) => ipcRenderer.invoke('set-key', key),
  brain: (patch) => ipcRenderer.invoke('brain', patch),
  freeFetch: () => ipcRenderer.invoke('free-fetch'),
  freeCancel: () => ipcRenderer.send('free-cancel'),
  toolResult: (id, outcome) => ipcRenderer.send('tool-result', { id, outcome }),
  onCursor: listen('cursor'),
  onAway: listen('away'),
  onCommand: listen('command'),
  onSettings: listen('settings'),
  onCrypt: listen('crypt'),
  onDoors: listen('doors'),
  onFreeProgress: listen('free-progress'),
  onSpeech: listen('speech'),
  onToolCall: listen('tool-call'),
  onToolCancel: listen('tool-cancel')
});
