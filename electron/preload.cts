import { contextBridge, ipcRenderer } from 'electron';
async function invoke(channel: string, ...args: unknown[]) {
  try { return await ipcRenderer.invoke(channel, ...args); }
  catch (error) {
    const message = error instanceof Error ? error.message : '操作失败，请重试。';
    throw new Error(message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''));
  }
}
// Expose named operations, never a generic IPC or filesystem bridge.
contextBridge.exposeInMainWorld('teamroom', {
  snapshot: () => invoke('room:snapshot'),
  send: (input: unknown) => invoke('room:send', input),
  settings: (value: unknown) => invoke('room:settings', value),
  chooseWorkspace: () => invoke('room:workspace'),
  cancel: (id: string) => invoke('room:cancel', id),
  accept: (id: string) => invoke('room:accept', id),
  approve: (id: string, allow: boolean) => invoke('room:approve', id, allow),
  quota: () => invoke('room:quota'),
  subscribe: (listener: (snapshot: unknown) => void) => {
    const callback = (_event: unknown, value: unknown) => listener(value);
    ipcRenderer.on('room:updated', callback);
    return () => ipcRenderer.removeListener('room:updated', callback);
  },
});
