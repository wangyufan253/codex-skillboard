import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Workbench } from './core.mjs';
import { projectRoot, webUrl, paths } from './paths.mjs';
import { instanceId } from './boot.mjs';
import { pathToFileURL } from 'node:url';
export function createWorkbenchServer(app=new Workbench()){
  const token=randomBytes(32).toString('hex');
  const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    try{
      const address=server.address();const port=typeof address==='object'?address.port:app.config.port;
      const origin=`http://127.0.0.1:${port}`;
      if(req.headers.host!==`127.0.0.1:${port}`&&req.headers.host!==`localhost:${port}`)return json(res,{error:'Host 不匹配'},403);
      if(req.headers['sec-fetch-site']==='cross-site')return json(res,{error:'拒绝跨站请求'},403);
      const url=new URL(req.url,origin);
      if(req.method==='GET'&&url.pathname==='/api/health')return json(res,{app:'skill-workbench',instance:instanceId(app.config),version:'0.1.0'});
      if(req.method==='GET'&&url.pathname==='/api/bootstrap')return json(res,{token,version:'0.1.0',categories:(await app.snapshot({runtime:false})).categories,conversationId:url.searchParams.get('conversation')||null});
      if(req.method==='GET'&&url.pathname==='/api/state')return json(res,await app.snapshot({conversationId:url.searchParams.get('conversation')||'',task:url.searchParams.get('task')||'',refresh:url.searchParams.get('refresh')==='1',days:url.searchParams.get('days')==='all'?0:30}));
      if(req.method==='GET'&&url.pathname==='/api/content'){const {skill,text}=await app.catalog.content(url.searchParams.get('id'));return json(res,{name:skill.name,path:skill.path,text});}
      if(req.method==='POST'&&url.pathname.startsWith('/api/')){
        if(req.headers.origin&&req.headers.origin!==origin&&req.headers.origin!==`http://localhost:${port}`)return json(res,{error:'来源不匹配'},403);
        if(req.headers['x-workbench-token']!==token||!req.headers['content-type']?.startsWith('application/json'))return json(res,{error:'请求校验失败，请刷新页面'},403);
        let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>131072)return json(res,{error:'请求过大'},413);}
        const body=JSON.parse(raw||'{}');
        if(url.pathname==='/api/selection')return json(res,await app.select(body.conversationId,body.skillIds));
        if(url.pathname==='/api/global'){
          if(typeof body.enabled!=='boolean')throw new Error('enabled 必须是布尔值');
          const skill=await app.catalog.get(body.skillId);const result=await app.codex.setGlobal(skill,body.enabled);await app.catalog.scan(true);app.runtimeCache.clear();return json(res,result);
        }
        if(url.pathname==='/api/preference'){await app.preference(body.skillId,{category:body.category,repo:body.repo});return json(res,{saved:true});}
        if(url.pathname==='/api/stars')return json(res,await app.stars({force:true}));
        if(url.pathname==='/api/recommend')return json(res,await app.snapshot({conversationId:body.conversationId,task:String(body.task||''),runtime:false}));
        throw new Error('未知操作');
      }
      const files={'/':['index.html','text/html; charset=utf-8'],'/styles.css':['styles.css','text/css; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8']};
      if(req.method==='GET'&&files[url.pathname]){const [file,type]=files[url.pathname];res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-cache'});res.end(await readFile(join(projectRoot,'public',file)));return;}
      json(res,{error:'未找到页面'},404);
    }catch(e){json(res,{error:e.message},400);}
  });
  server.requestTimeout=30000;
  return {server,app,token};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const config=paths();if(!Number.isInteger(config.port)||config.port<1024||config.port>65535)throw new Error('工作台端口无效');
  const {server,app}=createWorkbenchServer(new Workbench(config));
  server.on('error',e=>{console.error(e.message);app.close();process.exitCode=1;});
  server.listen(config.port,'127.0.0.1',()=>console.log(`Skill 工作台：${webUrl('',config)}`));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>{app.close();process.exit(0);}));
}
