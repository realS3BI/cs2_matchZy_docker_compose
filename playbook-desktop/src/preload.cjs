const { contextBridge, ipcRenderer } = require('electron');

// Expose individual operations only. Never expose ipcRenderer, console commands,
// filesystem paths, arbitrary URLs, or screen/window IDs to the remote website.
if (location.origin === 'https://playbook.schlossers.at' && window === window.top) {
  contextBridge.exposeInMainWorld('playbookDesktop', Object.freeze({
    version: 1,
    status: () => ipcRenderer.invoke('review:status'),
    launch: () => ipcRenderer.invoke('review:launch'),
    connect: () => ipcRenderer.invoke('review:connect'),
    frame: (width, height) => ipcRenderer.invoke('review:frame', width, height),
    begin: slot => ipcRenderer.invoke('review:begin', slot),
    end: token => ipcRenderer.invoke('review:end', token),
    disconnect: () => ipcRenderer.invoke('review:disconnect'),
    recover: () => ipcRenderer.invoke('review:recover'),
    checkUpdate: () => ipcRenderer.invoke('review:update-check'),
    installUpdate: () => ipcRenderer.invoke('review:update-install'),
    onStopVideo: callback => {
      const listener = () => callback();
      ipcRenderer.on('review:stop-video', listener);
      return () => ipcRenderer.removeListener('review:stop-video', listener);
    },
  }));
}
