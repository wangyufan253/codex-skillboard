import { readFile, writeFile, mkdir, rename, copyFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { paths,projectRoot,webUrl } from '../server/paths.mjs';
import { Workbench } from '../server/core.mjs';
import { safeRead } from '../server/catalog.mjs';
import { ensureServer } from '../server/boot.mjs';
const config=paths(),uninstall=process.argv.includes('--uninstall');
const hookPath=join(projectRoot,'scripts/hook.mjs'),mcpPath=join(projectRoot,'server/mcp.mjs');
const shellQuote=value=>"'"+value.replace(/'/g,"'\\''")+"'";
const baseCommand=shellQuote(process.execPath)+' '+shellQuote(hookPath);
const integrationEnv={SKILL_WORKBENCH_HOME:config.data,CODEX_HOME:config.codex,SKILL_WORKBENCH_PORT:String(config.port),SKILL_WORKBENCH_USER_HOME:config.home,...(process.env.SKILL_WORKBENCH_CODEX?{SKILL_WORKBENCH_CODEX:process.env.SKILL_WORKBENCH_CODEX}:{})};
const command='env '+Object.entries(integrationEnv).map(([key,value])=>key+'='+shellQuote(value)).join(' ')+' '+baseCommand;
const ownHook=hook=>hook.command===baseCommand||(hook.command?.startsWith('env ')&&hook.command.endsWith(' '+baseCommand));
const hookFile=join(config.codex,'hooks.json');
const backupDir=join(config.data,'backups');
await mkdir(backupDir,{recursive:true,mode:0o700});await mkdir(config.codex,{recursive:true,mode:0o700});
async function backup(file){try{const dest=join(backupDir,`${Date.now()}-${Math.random().toString(16).slice(2)}-${file.endsWith('hooks.json')?'hooks.json':'config.toml'}`);await copyFile(file,dest);await chmod(dest,0o600);}catch(e){if(e.code!=='ENOENT')throw e;}}
function codex(args){const r=spawnSync(process.env.SKILL_WORKBENCH_CODEX||'codex',args,{env:{...process.env,CODEX_HOME:config.codex},encoding:'utf8',timeout:15000});if(r.error)throw r.error;if(r.status!==0)throw new Error(r.stderr||r.stdout||'Codex 命令未成功');return r.stdout;}
let existingMcp=null;
try{existingMcp=JSON.parse(codex(['mcp','get','skill-workbench','--json']));}catch{}
const transport=existingMcp?.transport;
const ours=!existingMcp||JSON.stringify(transport||existingMcp).includes(mcpPath);
if(!ours)throw new Error('已存在另一个名为 skill-workbench 的 MCP 配置，未覆盖。请先检查现有配置。');
const raw=await safeRead(hookFile);const hooks=raw?JSON.parse(raw):{};hooks.hooks ||= {};
for(const event of ['UserPromptSubmit','PostToolUse']){
  const groups=hooks.hooks[event]||[];
  hooks.hooks[event]=groups.map(group=>({...group,hooks:(group.hooks||[]).filter(h=>!ownHook(h))})).filter(group=>group.hooks.length);
  if(!uninstall)hooks.hooks[event].push({...(event==='PostToolUse'?{matcher:'Bash|exec_command|read_file|readFile|.*__read_.*'}:{}),hooks:[{type:'command',command,timeout:8,...(event==='UserPromptSubmit'?{statusMessage:'检索本机 Skill',additionalContextLimit:12000}:{})}]});
  if(!hooks.hooks[event].length)delete hooks.hooks[event];
}
await backup(hookFile);await backup(config.config);
const temp=hookFile+'.skill-workbench-'+process.pid;await writeFile(temp,JSON.stringify(hooks,null,2)+'\n',{mode:0o600});await rename(temp,hookFile);
const app=new Workbench(config);
try{
  if(uninstall){if(existingMcp)await app.codex.call('config/value/write',{keyPath:'mcp_servers.skill-workbench',value:null,mergeStrategy:'replace',filePath:config.config});app.store.setSetting('integration',{configured:false,at:new Date().toISOString()});console.log('已移除本工作台的 MCP 与 Hook；保留其他配置、数据和备份。');}
  else{
    await app.codex.call('config/value/write',{keyPath:'mcp_servers.skill-workbench',value:{command:process.execPath,args:[mcpPath],env:integrationEnv},mergeStrategy:'replace',filePath:config.config});
    const id=process.env.CODEX_THREAD_ID;
    if(id&&!app.store.conversation(id))app.store.touchConversation({id,cwd:projectRoot});
    app.store.setSetting('integration',{configured:true,installedAt:new Date().toISOString(),hookFile,mcpName:'skill-workbench',trust:'requires-host-review'});
    await ensureServer(config);
    console.log(`已安装 Skill 工作台：${webUrl(id||'',config)}\n下一步：在 Codex 的 Review hooks 或 设置 > Hooks 中查看并信任新增的两个 Hook，再开始新聊天或重启 Codex 以加载 MCP。\n全局配置与原有 Hook 已备份到：${backupDir}`);
  }
}finally{app.close();}
