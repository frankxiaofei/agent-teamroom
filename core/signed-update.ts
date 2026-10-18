import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join} from 'node:path';
export interface Signature {status:string;thumbprint?:string;}
export async function loadUpdater(){return (await import('electron-updater')).default.autoUpdater;}
export const trustedSignature=(s:Signature)=>s?.status==='Valid'&&typeof s.thumbprint==='string'&&/^[a-f0-9]{40,64}$/i.test(s.thumbprint);
export async function windowsSignature(file:string):Promise<Signature> {
  if(process.platform!=='win32')return {status:'Unsupported'};
  try{const result=await promisify(execFile)(join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command','$s=Get-AuthenticodeSignature -LiteralPath $env:TEAMROOM_SIGNATURE_FILE; [pscustomobject]@{status=[string]$s.Status;thumbprint=$s.SignerCertificate.Thumbprint}|ConvertTo-Json -Compress'],{env:{...process.env,TEAMROOM_SIGNATURE_FILE:file},windowsHide:true,timeout:15000,maxBuffer:8192});return JSON.parse(result.stdout);}catch{return {status:'Unavailable'};}
}
export interface SignedUpdater {
  checkForUpdates():Promise<{updateInfo:{version:string};cancellationToken?:{cancel():void}}|null>;
  downloadUpdate(token?:any):Promise<string[]>;
  quitAndInstall(silent?:boolean,runAfter?:boolean):void;
}
export async function installSignedUpdate(options:{executable:string;expectedVersion:string;updater:SignedUpdater;signature:(file:string)=>Promise<Signature>;canQuit:()=>boolean;onCancelToken?:(token?:{cancel():void})=>void}) {
  const current=await options.signature(options.executable);
  if(!trustedSignature(current))throw new Error('当前程序未通过可信代码签名验证，自动安装已禁用。请使用官方下载页手动更新。');
  const checked=await options.updater.checkForUpdates();if(!checked||checked.updateInfo.version!==options.expectedVersion)throw new Error('可用版本已变化或更新元数据缺失，请重新检查更新。');
  options.onCancelToken?.(checked.cancellationToken);
  try{
    const files=await options.updater.downloadUpdate(checked.cancellationToken);if(!files.length)throw new Error('更新文件未下载完成。');
    const downloaded=await options.signature(files[0]);
    if(!trustedSignature(downloaded)||downloaded.thumbprint!.toLowerCase()!==current.thumbprint!.toLowerCase())throw new Error('更新安装包签名与当前程序不一致，未执行安装。');
    if(!options.canQuit())throw new Error('仍有执行中的任务，请结束或取消工作后重试安装。');
    options.updater.quitAndInstall(false,true);
  }finally{options.onCancelToken?.(undefined);}
}
