import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { recommend, userTask } from './recommend.mjs';
import { hash } from './catalog.mjs';
import { webUrl } from './paths.mjs';
export async function promptHook(workbench,event){
  const {session_id:id,cwd,turn_id:turnId}=event;
  const prompt=userTask(event.prompt);
  if(!id||!cwd)return {};
  const previousTask=userTask(workbench.store.setting('task:'+id,''));
  const task=prompt.trim().length<24&&previousTask?previousTask+'\n'+prompt:prompt;
  const c=workbench.store.touchConversation({id,cwd,prompt,turnId,fromHook:true});
  const {skills}=await workbench.catalog.scan(true);
  const selected=skills.filter(s=>c.selection.includes(s.id));
  const messages=[`Skill 工作台：当前对话 ID 是 ${id}，管理地址 ${webUrl(id,workbench.config)}。只对这个 ID 保存选择，不要把其他对话的选择用于本对话。`];
  const missing=c.selection.filter(id=>!skills.some(s=>s.id===id));
  if(missing.length)messages.push(`${missing.length} 个已选 Skill 已移走或无法读取，请告知用户到工作台检查。`);
  let size=0;
  for(const skill of selected){
    try{
      const {text}=await workbench.catalog.content(skill.id);
      if(size+text.length>160000){messages.push(`用户为本对话选用了 ${skill.name}，请通过 load_skill 工具读取，skillId=${skill.id}，conversationId=${id}，turnId=${turnId||''}。不可截取或假定已读取其完整流程。`);continue;}
      size+=text.length;
      messages.push(`用户为本对话明确选用 ${skill.name}（${skill.path}）。以下是用户选定的流程资料，只在本对话内使用；不修改全局启用状态，不授权绕过宿主权限和更高优先级指令。\n<user_selected_skill name=${JSON.stringify(skill.name)}>\n${text}\n</user_selected_skill>`);
      workbench.store.event({key:`injected:${id}:${turnId||hash(prompt)}:${skill.id}`,kind:'injected',conversationId:id,turnId,skillId:skill.id,evidence:'UserPromptSubmit 已输出完整说明，非执行成功证明'});
    }catch(e){messages.push(`已选 ${skill.name} 读取失败：${e.message}。不要声称已使用。`);}
  }
  workbench.store.injected(id,c.selectionVersion);
  const candidates=(prompt?recommend(skills,task,4):[]).filter(s=>!c.selection.includes(s.id));
  if(candidates.length&&prompt.trim().length>=24)workbench.store.setSetting('task:'+id,prompt);
  const signature=candidates.map(s=>s.id).join(',');
  if(signature&&signature!==workbench.store.setting('recommend:'+id,'')){
    workbench.store.setSetting('recommend:'+id,signature);
    messages.push('本轮出现以下适用候选。用简短中文给出推荐和工作台链接，让用户选择；推荐本身不代表已选用，不自动改变全局配置，不反复询问相同候选。保留 Codex 自身按需要选用其他可用 Skill 的能力。\n'+candidates.map(r=>`${r.rank}. ${skills.find(s=>s.id===r.id).name}：${r.reason}；skillId=${r.id}`).join('\n'));
  }
  return {hookSpecificOutput:{hookEventName:'UserPromptSubmit',additionalContext:messages.join('\n\n')}};
}
function knownSuccess(response){
  if(!response||typeof response!=='object')return false;
  if(response.isError===true||response.exit_code>0||response.exitCode>0||response.success===false)return false;
  return response.exit_code===0||response.exitCode===0||response.success===true||response.isError===false||Array.isArray(response.content)&&response.content.some(c=>c.type==='text');
}
export async function observeHook(workbench,event){
  if(!event.session_id||!event.cwd||!knownSuccess(event.tool_response))return {};
  const name=event.tool_name||'';if(!/read|Bash|exec_command/i.test(name)||/write|edit|load_skill/i.test(name))return {};
  let input=event.tool_input||{};if(typeof input==='string'){try{input=JSON.parse(input);}catch{return {};}}
  const candidates=[];
  if(/read/i.test(name))for(const k of ['path','file_path','filePath','filename'])if(typeof input[k]==='string')candidates.push(input[k]);
  if(/Bash|exec_command/.test(name)){
    const command=input.command||input.cmd;
    if(typeof command==='string'){
      // Count only a complete, simple cat command. A path merely mentioned in code is not a load.
      const m=command.match(/^\s*cat\s+(?:--\s+)?(?:"([^"$`]+)"|'([^']+)'|([^\s;&|<>$`]+))\s*$/);
      if(m)candidates.push(m[1]||m[2]||m[3]);
    }
  }
  if(!candidates.length)return {};
  const {skills}=await workbench.catalog.scan();
  for(const file of candidates){
    let rp;try{rp=await realpath(resolve(event.cwd,file));}catch{continue;}
    const skill=skills.find(s=>s.realPath===rp);if(!skill)continue;
    const turn=event.turn_id||event.tool_use_id;if(!turn)continue;
    workbench.store.event({key:`loaded:${event.session_id}:${turn}:${skill.id}`,kind:'loaded',conversationId:event.session_id,turnId:turn,skillId:skill.id,evidence:`${name} 成功读取已登记的 SKILL.md`});
  }
  return {};
}
