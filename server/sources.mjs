import { createHash } from 'node:crypto';
import sources from './data/skill-sources.json' with { type:'json' };

export const HOUR=3600000;
export const fingerprint=text=>createHash('sha1').update('blob '+Buffer.byteLength(text)+'\0').update(text).digest('hex');
export function sourceMatch(text,store){
  const sha=fingerprint(text),matches=new Map();
  for(const [repo,files] of Object.entries(sources))if(files[sha])matches.set(repo,files[sha]);
  for(const [repo,entry] of Object.entries(store.setting('sourceTrees',{})))if(entry.files?.[sha])matches.set(repo,entry.files[sha]);
  if(matches.size!==1)return null;
  const [repo,path]=[...matches][0];return {repo,path,sha};
}
export async function githubJson(url,fetcher){
  const response=await fetcher(url,{headers:{Accept:'application/vnd.github+json','User-Agent':'codex-skillboard/0.1'},signal:AbortSignal.timeout(8000)});
  if(!response.ok){
    const limited=response.status===429||(response.status===403&&response.headers?.get('x-ratelimit-remaining')==='0');
    const error=new Error(limited?'GitHub 请求额度已用尽，等待恢复':`GitHub 返回 ${response.status}`);
    if(limited){const reset=Number(response.headers?.get('x-ratelimit-reset'))*1000,retry=Number(response.headers?.get('retry-after'))*1000;error.retryAt=Math.max(Date.now()+HOUR,reset||0,Date.now()+(retry||0));}
    throw error;
  }
  return response.json();
}
export async function refreshSources(store,fetcher,active=()=>true){
  const cache=store.setting('sourceTrees',{}),errors=[];
  for(const repo of Object.keys(sources)){
    if(!active())break;
    if(cache[repo]?.checkedAt&&Date.now()-Date.parse(cache[repo].checkedAt)<24*HOUR)continue;
    try{
      const data=await githubJson(`https://api.github.com/repos/${repo}/git/trees/HEAD?recursive=1`,fetcher);
      if(data.truncated||!Array.isArray(data.tree))throw new Error('仓库文件树不完整，保留已有来源指纹');
      const files=Object.fromEntries(data.tree.filter(x=>x.type==='blob'&&/(^|\/)SKILL\.md$/.test(x.path)&&/^[a-f0-9]{40}$/.test(x.sha)).map(x=>[x.sha,x.path]));
      cache[repo]={checkedAt:new Date().toISOString(),files:{...cache[repo]?.files,...files},error:null};
    }catch(e){cache[repo]={...cache[repo],checkedAt:new Date().toISOString(),error:e.message};errors.push({repo,message:e.message});if(e.retryAt){if(active())store.setSetting('githubRetryAt',e.retryAt);break;}}
    if(active())store.setSetting('sourceTrees',cache);
  }
  return errors;
}
