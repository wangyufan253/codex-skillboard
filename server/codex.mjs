import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, copyFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { realpath } from 'node:fs/promises';
import { readConfig, globalEnabled } from './catalog.mjs';
export class CodexClient {
  constructor(config){this.config=config;this.pending=new Map();this.next=0;this.ready=null;this.child=null;}
  async connect(){
    if(this.ready)return this.ready;
    this.ready=new Promise((resolve,reject)=>{
      const p=this.child=spawn(process.env.SKILL_WORKBENCH_CODEX||'codex',['app-server','--listen','stdio://'],{cwd:this.config.home,env:{...process.env,CODEX_HOME:this.config.codex},stdio:['pipe','pipe','pipe']});
      p.stderr.on('data',()=>{});
      createInterface({input:p.stdout}).on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}const pending=this.pending.get(m.id);if(!pending)return;clearTimeout(pending.timer);this.pending.delete(m.id);m.error?pending.reject(new Error(m.error.message)):pending.resolve(m.result);});
      const fail=e=>{for(const v of this.pending.values()){clearTimeout(v.timer);v.reject(e);}this.pending.clear();this.child=null;this.ready=null;reject(e);};
      p.on('error',fail);p.on('exit',()=>fail(new Error('Codex 接口连接已关闭')));
      this.raw('initialize',{clientInfo:{name:'local_skill_workbench',title:'Skill 工作台',version:'0.1.0'},capabilities:{experimentalApi:true}}).then(()=>{p.stdin.write(JSON.stringify({method:'initialized'})+'\n');resolve();},reject);
    });
    return this.ready;
  }
  raw(method,params){return new Promise((resolve,reject)=>{const id=++this.next;const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Codex 接口超时：'+method));},10000);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,method,params})+'\n',e=>{if(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});});}
  async call(method,params){await this.connect();return this.raw(method,params);}
  async conversationDirectory(){
    const pages=async(method,params)=>{const rows=[];let cursor;do{const r=await this.call(method,{...params,...(cursor?{cursor}:{})});rows.push(...r.data);cursor=r.nextCursor;}while(cursor);return rows;};
    const [projects,threads]=await Promise.all([
      pages('project/list',{limit:100}),
      pages('thread/list',{limit:100,sortKey:'updated_at',modelProviders:[],useStateDbOnly:true})
    ]);
    return {projects,threads};
  }
  async list(cwd){const r=await this.call('skills/list',{cwds:[cwd],forceReload:true});return r.data?.[0]||{skills:[],errors:[]};}
  async registered(cwd){const result=await this.list(cwd);const data=new Map();for(const s of result.skills){try{data.set(await realpath(s.path),s);}catch{}}return {data,errors:result.errors};}
  async setGlobal(skill,enabled){
    const dir=join(this.config.data,'backups');await mkdir(dir,{recursive:true,mode:0o700});
    const backup=join(dir,`config-${Date.now()}-${Math.random().toString(16).slice(2)}.toml`);
    try{await copyFile(this.config.config,backup);await chmod(backup,0o600);}catch(e){if(e.code!=='ENOENT')throw e;}
    const result=await this.call('skills/config/write',{path:skill.path,enabled});
    const config=await readConfig(this.config.config);if(globalEnabled(config,skill)!==enabled)throw new Error('Codex 未保存预期的全局配置，请刷新后重试');
    return {saved:true,globalEnabled:enabled,effectiveInFreshRuntime:result.effectiveEnabled,liveConversation:'unknown',message:'全局配置已保存。现有聊天中的加载状态不保证立即改变。'};
  }
  close(){this.child?.kill();}
}
