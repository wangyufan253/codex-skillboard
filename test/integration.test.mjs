import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,writeFile,readdir } from 'node:fs/promises';
import { fixture } from './helpers.mjs';
import { createWorkbenchServer } from '../server/http.mjs';
test('official Codex API writes an isolated global config and preserves unrelated settings',async t=>{
  const f=await fixture(t);const path=await f.skill('test-skill','Test workflow');const s=(await f.app.catalog.scan()).skills[0];
  const r=await f.app.codex.setGlobal(s,false);assert.equal(r.saved,true);assert.equal(r.liveConversation,'unknown');
  const text=await readFile(f.config.config,'utf8');assert.match(text,/model = "test"/);assert.match(text,/enabled = false/);
  assert.ok((await readdir(f.config.data+'/backups')).length);
  await f.app.codex.setGlobal(s,true);assert.equal((await f.app.catalog.scan(true)).skills[0].globalEnabled,true);
});
test('local HTTP API rejects cross-origin and unauthenticated writes, and stores only validated selections',async t=>{
  const f=await fixture(t);await f.skill('frontend-design','Design interfaces');f.app.store.touchConversation({id:'A',cwd:f.home,prompt:'design UI'});
  const {server,token}=createWorkbenchServer(f.app);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const origin='http://127.0.0.1:'+server.address().port;const id=(await f.app.catalog.scan()).skills[0].id;
  const body=JSON.stringify({conversationId:'A',skillIds:[id]});
  assert.equal((await fetch(origin+'/api/selection',{method:'POST',headers:{'Content-Type':'application/json'},body})).status,403);
  assert.equal((await fetch(origin+'/api/selection',{method:'POST',headers:{'Content-Type':'application/json','x-workbench-token':token,Origin:'https://example.com'},body})).status,403);
  const response=await fetch(origin+'/api/selection',{method:'POST',headers:{'Content-Type':'application/json','x-workbench-token':token,Origin:origin},body});assert.equal(response.status,200);assert.deepEqual(f.app.store.conversation('A').selection,[id]);
  const bad=await fetch(origin+'/api/selection',{method:'POST',headers:{'Content-Type':'application/json','x-workbench-token':token},body:JSON.stringify({conversationId:'B',skillIds:[id]})});assert.equal(bad.status,400);
  assert.equal((await fetch(origin+'/.local/workbench.sqlite')).status,404);
  f.app.stars=async options=>{assert.equal(options.force,true,'manual refresh must bypass the hourly cache');return {repositories:1,updated:1,failed:0,unknown:0,errors:[]};};
  assert.equal((await fetch(origin+'/api/stars',{method:'POST',headers:{'Content-Type':'application/json','x-workbench-token':token},body:'{}'})).status,200);
});
