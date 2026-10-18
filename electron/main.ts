import { app, BrowserWindow, ipcMain, dialog, protocol, net, Menu, Tray, nativeImage, Notification, powerMonitor, shell } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve, relative, isAbsolute, basename } from 'node:path';
import { openSync, readSync, closeSync, writeFileSync } from 'node:fs';
import { BILL_TEMPLATE } from '../core/billing.js';
import { checkUpdates, validReleasePage, type UpdateInfo } from '../core/updates.js';
import {windowsSignature,trustedSignature,installSignedUpdate,loadUpdater} from '../core/signed-update.js';
import { Teamroom } from '../core/service.js';
import { Store } from '../core/store.js';
import { restoreStore } from '../core/backup.js';

protocol.registerSchemesAsPrivileged([{ scheme: 'teamroom', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const here = dirname(fileURLToPath(import.meta.url));
if (process.env.TEAMROOM_DATA_DIR) app.setPath('userData', resolve(process.env.TEAMROOM_DATA_DIR));
const devURL = process.env.TEAMROOM_DEV_URL;
let service: Teamroom;
let window: BrowserWindow;
let tray: Tray;
let quitting = false;
let maintenance = false;
let updateInfo: UpdateInfo | undefined;
let installingUpdate=false;
let updateCancelToken:{cancel():void}|undefined;
let updateCancelRequested=false;
let updateQuitPending=false;
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => { if (window && !window.isDestroyed()) { window.show(); if (window.isMinimized()) window.restore(); window.focus(); } });
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
const databasePath = join(app.getPath('userData'), 'teamroom.db');
service = new Teamroom(new Store(databasePath));
app.setAppUserModelId('com.teamroom.desktop');
window = new BrowserWindow({ width: 1280, height: 940, minWidth: 700, minHeight: 600, title: 'Teamroom', backgroundColor: '#f6f5f1', webPreferences: { preload: join(here, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
const pixels = Buffer.alloc(24 * 24 * 4);
for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
  const white = (y >= 5 && y <= 8 && x >= 5 && x <= 18) || (x >= 10 && x <= 13 && y >= 8 && y <= 19);
  pixels.set(white ? [255, 255, 255, 255] : [61, 111, 85, 255], (y * 24 + x) * 4);
}
tray = new Tray(nativeImage.createFromBitmap(pixels, { width: 24, height: 24 }));
tray.setToolTip('Teamroom · 工作群与主动汇报');
const show = () => { window.show(); if (window.isMinimized()) window.restore(); window.focus(); };
tray.on('double-click', show);
tray.setContextMenu(Menu.buildFromTemplate([{ label: '打开 Teamroom', click: show }, { label: '立即汇报', click: () => { service.report(); show(); } }, { type: 'separator' }, { label: '退出 Teamroom', click: () => app.quit() }]));
window.on('close', event => { if (!quitting) { event.preventDefault(); window.hide(); } });
window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
window.webContents.on('will-navigate', event => event.preventDefault());
window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
function handle(channel: string, fn: (...args: any[]) => unknown) {
  ipcMain.handle(channel, (event, ...args) => {
    const url = event.senderFrame?.url;
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || !url || !(devURL ? url.startsWith(devURL + '/') || url === devURL : url.startsWith('teamroom://app/'))) throw new Error('非法 IPC 来源。');
    if (maintenance && channel !== 'room:snapshot') throw new Error('正在备份或恢复记录，请稍后操作。');
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
handle('room:account', value => service.account(value));
handle('room:removeAccount', id => service.removeAccount(id));
handle('room:removeBill', id=>service.removeBill(id));
handle('room:importBills',async accountId=>{
  maintenance=true;
  try {
    const selected=await dialog.showOpenDialog(window,{title:'导入账户账单 CSV',properties:['openFile'],filters:[{name:'UTF-8 CSV',extensions:['csv']}]});if(selected.canceled||!selected.filePaths[0])return null;
    const fd=openSync(selected.filePaths[0],'r');let text: string;
    try {const buffer=Buffer.alloc(1024*1024+1),size=readSync(fd,buffer,0,buffer.length,0);if(size>1024*1024)throw new Error('账单 CSV 不得超过 1 MiB。');text=new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,size));}finally{closeSync(fd);}
    return service.importBills(accountId,text,basename(selected.filePaths[0]).slice(0,200));
  }finally{maintenance=false;}
});
handle('room:billTemplate',async()=>{
  const selected=await dialog.showSaveDialog(window,{title:'保存账单导入模板',defaultPath:'teamroom-bills.csv',filters:[{name:'CSV',extensions:['csv']}]});if(selected.canceled||!selected.filePath)return false;
  writeFileSync(selected.filePath,'\uFEFF'+BILL_TEMPLATE,{encoding:'utf8',flag:'wx'});return true;
});
handle('room:checkUpdates',async channel=>{updateInfo=undefined;const found=await checkUpdates(app.getVersion(),channel,(url,options)=>net.fetch(String(url),options));found.canAutoInstall=Boolean(app.isPackaged&&process.platform==='win32'&&!process.env.PORTABLE_EXECUTABLE_FILE&&trustedSignature(await windowsSignature(process.execPath)));updateInfo=found;return found;});
handle('room:openUpdate',async()=>{if(!updateInfo?.available||!validReleasePage(updateInfo.url))throw new Error('请先检查到可用版本。');await shell.openExternal(updateInfo.url);});
handle('room:cancelUpdate',()=>{updateCancelRequested=true;updateCancelToken?.cancel();});
handle('room:installUpdate',async()=>{
  if(installingUpdate)throw new Error('更新已在进行中。');
  if(!app.isPackaged||process.platform!=='win32'||process.env.PORTABLE_EXECUTABLE_FILE||!updateInfo?.available||!updateInfo.canAutoInstall)throw new Error('自动安装仅用于已安装的可信签名 Windows 版本；请使用下载页手动更新。');
  if(service.hasActiveWork())throw new Error('请先结束或取消任务和讨论，再安装更新。');
  installingUpdate=true;updateCancelRequested=false;const expected=updateInfo.latest!.replace(/^v/,''),channel=updateInfo.channel;
  try {
    const confirmation=await dialog.showMessageBox(window,{type:'question',buttons:['取消','下载并安装'],defaultId:0,cancelId:0,message:'下载并安装 '+expected+'？',detail:'会校验安装包签名。安装将退出并重新打开 Teamroom，已有记录保留。'});if(confirmation.response!==1)return false;
    if(updateCancelRequested)return false;
    const autoUpdater=await loadUpdater();autoUpdater.autoDownload=false;autoUpdater.autoInstallOnAppQuit=false;autoUpdater.allowPrerelease=channel==='preview';autoUpdater.allowDowngrade=false;autoUpdater.logger=null;
    if(!autoUpdater.listenerCount('error'))autoUpdater.on('error',()=>{if(updateQuitPending){updateQuitPending=false;maintenance=false;dialog.showErrorBox('更新安装未完成','请从官方下载页手动更新，现有工作记录保留。');}});
    autoUpdater.setFeedURL({provider:'github',owner:'frankxiaofei',repo:'agent-teamroom'});
    await installSignedUpdate({executable:process.execPath,expectedVersion:expected,updater:autoUpdater as any,signature:windowsSignature,canQuit:()=>{if(maintenance||service.hasActiveWork()||updateCancelRequested)return false;maintenance=true;updateQuitPending=true;return true;},onCancelToken:token=>{updateCancelToken=token;if(updateCancelRequested)token?.cancel();}});return true;
  }catch(error){if(updateQuitPending){updateQuitPending=false;maintenance=false;}throw error;}
  finally{installingUpdate=false;updateCancelToken=undefined;}
});
handle('room:backup', async () => {
  maintenance = true;
  try {
    const result = await dialog.showSaveDialog(window, { title: '备份 Teamroom 记录', defaultPath: 'teamroom-backup-' + Date.now() + '.db', filters: [{ name: 'Teamroom SQLite', extensions: ['db'] }] });
    if (result.canceled || !result.filePath) return null;
    await service.store.backup(result.filePath); return result.filePath;
  } finally { maintenance = false; }
});
handle('room:restore', async () => {
  if (service.hasActiveWork()) throw new Error('请先结束或取消正在执行的任务和讨论，再恢复记录。');
  maintenance = true;
  try {
    const selected = await dialog.showOpenDialog(window, { title: '选择 Teamroom 备份', properties: ['openFile'], filters: [{ name: 'Teamroom SQLite', extensions: ['db'] }] });
    if (selected.canceled || !selected.filePaths[0]) return false;
    const confirmed = await dialog.showMessageBox(window, { type: 'warning', buttons: ['取消', '恢复记录'], defaultId: 0, cancelId: 0, message: '恢复将替换当前本地记录。', detail: '会先自动备份当前数据库。恢复后默认演示、只读；未完成工作不会自动重放。' });
    if (confirmed.response !== 1) return false;
    const old = service;
    try { const restored = await restoreStore(old.store, databasePath, selected.filePaths[0]); old.close(); service = new Teamroom(restored.store); }
    catch (error) { if (old.store.closed) { old.close(); service = new Teamroom(new Store(databasePath)); } throw error; }
    finally { if (service !== old) { bindService(); window.webContents.send('room:updated', service.snapshot()); } }
    return true;
  } finally { maintenance = false; }
});
handle('room:reporting', value => service.reporting(value));
handle('room:report', () => service.report());
handle('room:discuss', input => service.discuss(input));
handle('room:discussionReply', (id, text) => service.discussionReply(id, text));
handle('room:discussionRound', id => service.discussionRound(id));
handle('room:discussionResolve', (id, decision, resume) => service.discussionResolve(id, decision, resume));
handle('room:discussionCancel', id => service.discussionCancel(id));
function bindService() {
service.on('snapshot', snapshot => { if (!window.isDestroyed()) window.webContents.send('room:updated', snapshot); });
service.on('notice', notice => {
  if (notice.source !== service.store.settings().mode || !service.snapshot().reporting.notifications || !Notification.isSupported()) return;
  try { const notification = new Notification({ title: notice.title, body: notice.body.slice(0, 180) }); notification.on('click', () => { show(); window.webContents.send('room:focus', notice); }); notification.on('failed', () => {}); notification.show(); } catch { /* The group record remains available when the OS blocks notifications. */ }
});
}
bindService();
if (devURL) await window.loadURL(devURL); else await window.loadURL('teamroom://app/');
service.tick();
const timer = setInterval(() => { if (!maintenance) service.tick(); }, 15000);
const resume = () => { if (!maintenance) service.tick(); }; powerMonitor.on('resume', resume);
app.on('before-quit', () => { quitting = true; clearInterval(timer); powerMonitor.removeListener('resume', resume); service.close(); tray.destroy(); });
app.on('window-all-closed', () => app.quit());
});
