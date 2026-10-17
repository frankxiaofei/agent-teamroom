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
  reporting: (value: unknown) => invoke('room:reporting', value),
  report: () => invoke('room:report'),
  discuss: (input: unknown) => invoke('room:discuss', input),
  discussionReply: (id: string, text: string) => invoke('room:discussionReply', id, text),
  discussionRound: (id: string) => invoke('room:discussionRound', id),
  discussionResolve: (id: string, decision: string, resume: boolean) => invoke('room:discussionResolve', id, decision, resume),
  discussionCancel: (id: string) => invoke('room:discussionCancel', id),
  onFocus: (listener: (target: unknown) => void) => {
    const callback = (_event: unknown, target: unknown) => listener(target);
    ipcRenderer.on('room:focus', callback);
    return () => ipcRenderer.removeListener('room:focus', callback);
  },
  subscribe: (listener: (snapshot: unknown) => void) => {
    const callback = (_event: unknown, value: unknown) => listener(value);
    ipcRenderer.on('room:updated', callback);
    return () => ipcRenderer.removeListener('room:updated', callback);
  },
});
