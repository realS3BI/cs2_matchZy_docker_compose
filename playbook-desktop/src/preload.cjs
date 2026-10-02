const { contextBridge, ipcRenderer } = require('electron');

async function invoke(channel, ...args) {
  try { return await ipcRenderer.invoke(channel, ...args); }
  catch (error) {
    const message = String(error?.message || error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
    throw new Error(message);
  }
}

// Expose individual operations only. Never expose ipcRenderer, console commands,
// filesystem paths, arbitrary URLs, or screen/window IDs to the remote website.
if (location.origin === 'https://playbook.schlossers.at' && window === window.top) {
  contextBridge.exposeInMainWorld('playbookDesktop', Object.freeze({
    version: 1,
    status: () => invoke('review:status'),
    launch: () => invoke('review:launch'),
    connect: () => invoke('review:connect'),
    frame: (width, height) => invoke('review:frame', width, height),
    begin: (slot, cameraPitch) => invoke('review:begin', slot, cameraPitch),
    end: token => invoke('review:end', token),
    disconnect: () => invoke('review:disconnect'),
    recover: () => invoke('review:recover'),
    checkUpdate: () => invoke('review:update-check'),
    installUpdate: () => invoke('review:update-install'),
    onStopVideo: callback => {
      const listener = () => callback();
      ipcRenderer.on('review:stop-video', listener);
      return () => ipcRenderer.removeListener('review:stop-video', listener);
    },
  }));
}
