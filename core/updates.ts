export interface UpdateInfo { current: string; latest?: string; available: boolean; url?: string; checkedAt: number; channel: 'stable'|'preview'; canAutoInstall?:boolean; }
const repository='https://github.com/frankxiaofei/agent-teamroom';
const version=(v: string)=>/^v?(\d{1,5})\.(\d{1,5})\.(\d{1,5})$/.exec(v)?.slice(1).map(Number);
export function selectUpdate(current: string, releases: unknown, channel: 'stable'|'preview', now=Date.now()): UpdateInfo {
  const base=version(current);if(!base||!Array.isArray(releases))throw new Error('无法识别版本信息。');
  const candidates=releases.filter(r=>r&&r.draft===false&&typeof r.prerelease==='boolean'&&(channel==='preview'||!r.prerelease)&&typeof r.tag_name==='string'&&version(r.tag_name));
  const compare=(a: number[],b: number[])=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2];
  candidates.sort((a,b)=>compare(version(b.tag_name)!,version(a.tag_name)!));const latest=candidates[0];
  return {current,latest:latest?.tag_name,available:Boolean(latest&&compare(version(latest.tag_name)!,base)>0),url:latest?repository+'/releases/tag/'+latest.tag_name:undefined,checkedAt:now,channel};
}
export async function checkUpdates(current: string,channel: 'stable'|'preview',fetcher: typeof fetch=fetch): Promise<UpdateInfo> {
  if(!['stable','preview'].includes(channel))throw new Error('更新通道无效。');
  const response=await fetcher('https://api.github.com/repos/frankxiaofei/agent-teamroom/releases?per_page=30',{headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok)throw new Error(`更新服务暂不可用（${response.status}），请稍后重试。`);
  const text=await response.text();if(text.length>2*1024*1024)throw new Error('更新信息超过大小限制。');return selectUpdate(current,JSON.parse(text),channel);
}
export function validReleasePage(url: unknown): url is string {return typeof url==='string'&&/^https:\/\/github\.com\/frankxiaofei\/agent-teamroom\/releases\/tag\/v?\d{1,5}\.\d{1,5}\.\d{1,5}$/.test(url);}
