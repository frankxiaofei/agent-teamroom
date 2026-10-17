import { contextBridge, ipcRenderer } from 'electron';
// Expose named operations, never a generic IPC or filesystem bridge.
contextBridge.exposeInMainWorld('teamroom', {
  snapshot: () => ipcRenderer.invoke('room:snapshot'),
  send: (input: unknown) => ipcRenderer.invoke('room:send', input),
  settings: (value: unknown) => ipcRenderer.invoke('room:settings', value),
  chooseWorkspace: () => ipcRenderer.invoke('room:workspace'),
  cancel: (id: string) => ipcRenderer.invoke('room:cancel', id),
  accept: (id: string) => ipcRenderer.invoke('room:accept', id),
  approve: (id: string, allow: boolean) => ipcRenderer.invoke('room:approve', id, allow),
  quota: () => ipcRenderer.invoke('room:quota'),
  subscribe: (listener: (snapshot: unknown) => void) => {
    const callback = (_event: unknown, value: unknown) => listener(value);
    ipcRenderer.on('room:updated', callback);
    return () => ipcRenderer.removeListener('room:updated', callback);
  },
});
