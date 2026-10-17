import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { Teamroom } from '../core/service.js';
import { Store } from '../core/store.js';

protocol.registerSchemesAsPrivileged([{ scheme: 'teamroom', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const here = dirname(fileURLToPath(import.meta.url));
if (process.env.TEAMROOM_DATA_DIR) app.setPath('userData', resolve(process.env.TEAMROOM_DATA_DIR));
const devURL = process.env.TEAMROOM_DEV_URL;
let service: Teamroom;
let window: BrowserWindow;
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => { if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.focus(); } });
// Do not top-level-await readiness: Electron emits ready after the ESM entry finishes.
void app.whenReady().then(async () => {
const root = resolve(here, '../../dist');
protocol.handle('teamroom', request => {
  const url = new URL(request.url);
  const target = resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
  const subpath = relative(root, target);
  if (url.host !== 'app' || subpath.startsWith('..') || isAbsolute(subpath)) return new Response('Forbidden', { status: 403 });
  return net.fetch(pathToFileURL(target).href);
});
service = new Teamroom(new Store(join(app.getPath('userData'), 'teamroom.db')));
window = new BrowserWindow({ width: 1280, height: 940, minWidth: 700, minHeight: 600, title: 'Teamroom', backgroundColor: '#f6f5f1', webPreferences: { preload: join(here, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
window.webContents.on('will-navigate', event => event.preventDefault());
window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
function handle(channel: string, fn: (...args: any[]) => unknown) {
  ipcMain.handle(channel, (event, ...args) => {
    const url = event.senderFrame?.url;
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !url || !(devURL ? url.startsWith(devURL + '/') || url === devURL : url.startsWith('teamroom://app/'))) throw new Error('非法 IPC 来源。');
    return fn(...args);
  });
}
handle('room:snapshot', () => service.snapshot());
handle('room:send', input => service.send(input));
handle('room:settings', value => service.settings(value));
handle('room:workspace', async () => { const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] }); return result.canceled ? null : result.filePaths[0]; });
handle('room:cancel', id => service.cancel(id));
handle('room:accept', id => service.accept(id));
handle('room:approve', (id, allow) => service.approve(id, allow));
handle('room:quota', () => service.quota());
service.on('snapshot', snapshot => { if (!window.isDestroyed()) window.webContents.send('room:updated', snapshot); });
if (devURL) await window.loadURL(devURL); else await window.loadURL('teamroom://app/');
app.on('before-quit', () => service.close());
app.on('window-all-closed', () => app.quit());
});
