import { spawn } from 'node:child_process';
import { mkdir, open, unlink, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from './catalog.mjs';
import { projectRoot, webUrl } from './paths.mjs';
export const instanceId=config=>hash(config.data).slice(0,20);
export async function ensureServer(config){
  const healthy=async()=>{try{const r=await fetch(webUrl('',config)+'api/health',{signal:AbortSignal.timeout(500)});const data=await r.json();if(data.app==='skill-workbench'&&data.instance===instanceId(config))return true;throw new Error('工作台端口已被其他服务占用');}catch(e){if(e.message.includes('端口'))throw e;return false;}};
  if(await healthy())return;
  await mkdir(config.data,{recursive:true,mode:0o700});
  const lockPath=join(config.data,'web-start.lock');let lock;
  try{lock=await open(lockPath,'wx',0o600);}catch(e){if(e.code!=='EEXIST')throw e;const info=await stat(lockPath);if(Date.now()-info.mtimeMs>15000){await unlink(lockPath);return ensureServer(config);}}
  try{
    if(lock){
      const log=await open(join(config.data,'server.log'),'a',0o600);
      const child=spawn(process.execPath,[join(projectRoot,'server/http.mjs')],{cwd:projectRoot,detached:true,stdio:['ignore',log.fd,log.fd],env:{...process.env,SKILL_WORKBENCH_HOME:config.data,CODEX_HOME:config.codex,SKILL_WORKBENCH_PORT:String(config.port)}});
      child.on('error',()=>{});child.unref();await log.close();
    }
    for(let i=0;i<16;i++){if(await healthy())return;await new Promise(r=>setTimeout(r,150));}
    throw new Error('工作台启动失败，请运行 npm start 查看错误，或检查端口 '+config.port);
  }finally{if(lock){await lock.close();await unlink(lockPath).catch(()=>{});}}
}
