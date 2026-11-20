import test from 'node:test';
import assert from 'node:assert/strict';
import { conversationDirectory } from '../server/conversations.mjs';
import { CodexClient } from '../server/codex.mjs';
import { fixture } from './helpers.mjs';

test('project hierarchy uses real titles and explicit membership, then longest root boundary',()=>{
  const metadata={verified:true,projects:[{id:'root',name:'项目',roots:[{path:'/work/app'}]},{id:'nested',name:'项目子组',roots:[{path:'/work/app/nested'}]}],threads:[{id:'A',name:'真实标题',preview:'不要把摘要用作标题',cwd:'/work/app/nested',projectId:'root'},{id:'B',name:'另一个对话',cwd:'/work/app/nested/code'},{id:'C',name:'相似路径',cwd:'/work/apple'}]};
  const d=conversationDirectory(metadata,[{id:'noise',prompt:'app generated suggestion',cwd:'/tmp'},{id:'current',prompt:'当前任务',cwd:'/work/app'}],'current');
  assert.equal(d.conversations.find(c=>c.id==='A').title,'真实标题');assert.equal(d.conversations.find(c=>c.id==='A').projectId,'root');assert.equal(d.conversations.find(c=>c.id==='B').projectId,'nested');assert.equal(d.conversations.find(c=>c.id==='C').projectId,'directory:/work/apple');assert.ok(!d.conversations.some(c=>c.id==='noise'));assert.ok(d.conversations.some(c=>c.id==='current'));
  assert.equal(d.projects.find(p=>p.id==='root').conversationCount,2);
  assert.equal(d.conversations.find(c=>c.id==='current').title,'未命名对话','latest task is never substituted for a conversation title');
});
test('directory client follows metadata pagination without fetching conversation content',async()=>{
  const c=new CodexClient({});const calls=[];c.call=async(method,params)=>{calls.push({method,params});return params.cursor?{data:[{id:method+'-two'}]}:{data:[{id:method+'-one'}],nextCursor:'next'};};
  const result=await c.conversationDirectory();assert.equal(result.projects.length,2);assert.equal(result.threads.length,2);assert.equal(calls.length,4);assert.ok(calls.every(c=>['project/list','thread/list'].includes(c.method)));assert.equal(calls.find(c=>c.method==='thread/list').params.useStateDbOnly,true);
});
test('selecting a discovered conversation binds only that conversation, preserving other selections',async t=>{
  const f=await fixture(t);await f.skill('demo','Task workflow');const id=(await f.app.catalog.scan()).skills[0].id;
  f.app.store.touchConversation({id:'A',cwd:f.home,prompt:'任务 A',fromHook:true});await f.app.select('A',[id]);
  f.app.codex.conversationDirectory=async()=>({projects:[{id:'project',name:'命名项目',roots:[{path:f.home}]}],threads:[{id:'A',name:'对话 A',cwd:f.home},{id:'B',name:'对话 B',preview:'任务 B',cwd:f.home}]});
  const s=await f.app.snapshot({conversationId:'B',runtime:false});assert.equal(s.conversation.title,'对话 B');assert.equal(s.conversation.projectId,'project');assert.equal(s.conversation.lastHook,null);assert.deepEqual(s.conversation.selection,[]);assert.deepEqual(f.app.store.conversation('A').selection,[id]);
  await f.app.select('B',[id]);assert.deepEqual(f.app.store.conversation('B').selection,[id]);
  f.app.codex.conversationDirectory=async()=>{throw new Error('offline');};const fallback=await f.app.snapshot({conversationId:'B',runtime:false,refresh:true});assert.equal(fallback.conversationDirectoryStatus.verified,false);assert.equal(fallback.conversation.title,'对话 B');assert.deepEqual(fallback.conversation.selection,[id]);
});
