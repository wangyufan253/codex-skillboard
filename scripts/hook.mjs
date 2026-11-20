import { Workbench } from '../server/core.mjs';
import { promptHook, observeHook } from '../server/hooks.mjs';
import { ensureServer } from '../server/boot.mjs';
let input='';
for await(const part of process.stdin){input+=part;if(input.length>2*1024*1024){input='';break;}}
let app;
try{
  const event=JSON.parse(input||'{}');app=new Workbench();
  const output=event.hook_event_name==='UserPromptSubmit'?await promptHook(app,event):event.hook_event_name==='PostToolUse'?await observeHook(app,event):{};
  if(event.hook_event_name==='UserPromptSubmit')await ensureServer(app.config).catch(e=>console.error('Skill 工作台：'+e.message));
  process.stdout.write(JSON.stringify(output)+'\n');
}catch(e){console.error('Skill 工作台 Hook 未完成：'+e.message);}finally{app?.close();}
