import { readFile,writeFile } from 'node:fs/promises';
import { fixture } from '../test/helpers.mjs';
import { createWorkbenchServer } from '../server/http.mjs';
import { projectRoot } from '../server/paths.mjs';
import { promptHook } from '../server/hooks.mjs';
const cleanup=[];const f=await fixture({after:fn=>cleanup.push(fn)});
await f.skill('frontend-design','Design page layout and interface');await f.skill('pdf','Read PDF documents');await f.skill('pytorch-training','Train neural models');
await f.skill('xss-skill','<img src=x onerror=alert(1)> is untrusted metadata');
for(let i=0;i<10;i++)await f.skill('helper-code-'+i,'Developer code workflow');
f.app.codex.registered=async()=>({data:new Map((await f.app.catalog.scan()).skills.map(s=>[s.realPath,{enabled:s.globalEnabled}])),errors:[]});
f.app.codex.conversationDirectory=async()=>({projects:[{id:'design-project',name:'设计项目',roots:[{path:f.home+'/design'}]},{id:'dev-project',name:'开发项目',roots:[{path:f.home+'/dev'}]},{id:'empty-project',name:'空项目',roots:[{path:f.home+'/empty'}]}],threads:[{id:'chat-A',name:'界面设计',cwd:f.home+'/design',projectId:'design-project'},{id:'chat-B',name:'接口调试',cwd:f.home+'/dev',projectId:'dev-project'}]});
const syncStars=f.app.stars.bind(f.app);let starRequests=0;
f.app.stars=options=>syncStars({...options,discover:false,fetcher:async()=>({ok:true,json:async()=>({stargazers_count:1000+(++starRequests)})})});
async function reset(){
  starRequests=0;f.app.store.db.exec('DELETE FROM repos;');
  f.app.store.db.exec('DELETE FROM conversations; DELETE FROM events; DELETE FROM preferences;');
  f.app.store.setSetting('integration',{configured:true});
  await writeFile(f.config.config,'model = "test"\n');await f.app.catalog.scan(true);f.app.runtimeCache.clear();
  f.app.store.touchConversation({id:'chat-A',cwd:f.home+'/design',prompt:'设计 UI 界面',fromHook:true});f.app.store.touchConversation({id:'chat-B',cwd:f.home+'/dev',prompt:'debug API',fromHook:true});
}
await reset();let result=null;
const {server}=createWorkbenchServer(f.app);const normal=server.listeners('request')[0];server.removeAllListeners('request');
server.on('request',async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/ui-test-hook'&&req.method==='POST'){
      await promptHook(f.app,{session_id:'chat-A',cwd:f.home+'/design',prompt:'设计 UI 界面',turn_id:'ui-turn'});
      const id=f.app.store.conversation('chat-A').selection[0];await f.app.load('chat-A',id,'ui-turn');
      res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');return;
    }
    if(path==='/'&&req.method==='GET'){await reset();result=null;let html=await readFile(projectRoot+'/public/index.html','utf8');html=html.replace('</head>','<script type="module" src="/browser-scenarios.js"></script></head>');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);return;}
    if(path==='/browser-scenarios.js'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(await readFile(projectRoot+'/test/browser-scenarios.js'));return;}
    if(path==='/ui-test-result'&&req.method==='POST'){let raw='';for await(const c of req)raw+=c;result=JSON.parse(raw);res.writeHead(200,{'Content-Type':'application/json'});res.end('{}');return;}
    if(path==='/ui-test-result'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));return;}
    normal(req,res);
  }catch(e){res.writeHead(500);res.end(e.message);}
});
server.listen(43823,'127.0.0.1',()=>console.log('UI fixtures: http://127.0.0.1:43823/?conversation=chat-A&view=all'));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{server.close();for(const fn of cleanup.reverse())await fn();process.exit(0);});
