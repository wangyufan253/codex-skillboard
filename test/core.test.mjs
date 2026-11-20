import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,writeFile,readFile,symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture } from './helpers.mjs';
import { parseSkill,normalizeRepo,globalEnabled } from '../server/catalog.mjs';
import { recommend } from '../server/recommend.mjs';
import { promptHook,observeHook } from '../server/hooks.mjs';
test('proper YAML parsing, folded text and source validation',()=>{
  const m=parseSkill('---\nname: demo\ndescription: >-\n  Write code:\n  inspect "facts".\nmetadata:\n  source: https://github.com/a/b\n---\n');
  assert.equal(m.description,'Write code: inspect "facts".');assert.equal(m.metadata.source,'https://github.com/a/b');
  assert.throws(()=>parseSkill('---\nname: demo\ndescription: 123\n---\n'));
  assert.equal(normalizeRepo('git@github.com:Owner/Repo.git'),'owner/repo');assert.equal(normalizeRepo('https://example.com/a/b'),null);assert.equal(normalizeRepo('https://github.com/a/b/issues'),null);
});
test('inventory excludes system/plugin entries, deduplicates real paths, retains distinct same-name files',async t=>{
  const f=await fixture(t);const first=await f.skill('frontend-design','Design an interface',f.shared);await f.skill('frontend-design','Another design');
  await mkdir(join(f.personal,'.system'),{recursive:true});await f.skill('builtin','System',join(f.personal,'.system'));
  await f.skill('plugin-only','Plugin',join(f.config.codex,'plugins/cache/test'));
  await symlink(join(f.shared,'frontend-design'),join(f.personal,'linked'));
  const s=await f.app.catalog.scan(true);assert.equal(s.skills.length,2);assert.equal(s.skills[0].name,s.skills[1].name);assert.notEqual(s.skills[0].id,s.skills[1].id);assert.equal(s.errors.length,0);
});
test('config selectors use ordered path and name rules',()=>{
  const s={name:'demo',path:'/tmp/a/SKILL.md',realPath:'/tmp/a/SKILL.md'};
  assert.equal(globalEnabled({skills:{config:[{name:'demo',enabled:false},{path:s.path,enabled:true}]}},s),true);
  assert.equal(globalEnabled({skills:{config:[{path:'/tmp/b/SKILL.md',enabled:false}]}},s),true);
});
test('Chinese task recommendation is contextual and never auto selects',async t=>{
  const f=await fixture(t);await f.skill('frontend-design','Design page layout and UI');await f.skill('pdf','Read and create PDF documents');await f.skill('pytorch-training','Train neural models');
  const {skills}=await f.app.catalog.scan();const r=recommend(skills,'设计界面的卡片配色');assert.equal(skills.find(s=>s.id===r[0].id).name,'frontend-design');assert.equal(recommend(skills,'').length,0);assert.equal(f.app.store.conversations().length,0);
});
test('conversation-only use of globally disabled skill never modifies config or another conversation',async t=>{
  const f=await fixture(t);const path=await f.skill('demo','Useful workflow');await writeFile(f.config.config,`[[skills.config]]\npath = ${JSON.stringify(path)}\nenabled = false\n`);
  const {skills}=await f.app.catalog.scan(true);const id=skills[0].id;assert.equal(skills[0].globalEnabled,false);
  f.app.store.touchConversation({id:'A',cwd:f.home,prompt:'task A'});f.app.store.touchConversation({id:'B',cwd:f.home,prompt:'task B'});
  const original=await readFile(f.config.config,'utf8');await f.app.select('A',[id]);await f.app.select('A',[id]);
  const a=await promptHook(f.app,{session_id:'A',cwd:f.home,prompt:'continue',turn_id:'t1'});const b=await promptHook(f.app,{session_id:'B',cwd:f.home,prompt:'continue',turn_id:'t1'});
  assert.match(a.hookSpecificOutput.additionalContext,/# Workflow/);assert.doesNotMatch(b.hookSpecificOutput.additionalContext,/# Workflow/);assert.deepEqual(f.app.store.conversation('B').selection,[]);assert.equal(await readFile(f.config.config,'utf8'),original);
  assert.equal(f.app.store.stats()[id].selected,1);assert.equal(f.app.store.stats()[id].injected,1);assert.equal(f.app.store.stats()[id].loaded,undefined);
  await promptHook(f.app,{session_id:'A',cwd:f.home,prompt:'continue',turn_id:'t1'});assert.equal(f.app.store.stats()[id].injected,1);
});
test('load counts require evidence and deduplicate within a turn',async t=>{
  const f=await fixture(t);const path=await f.skill('demo','Read this workflow');const id=(await f.app.catalog.scan()).skills[0].id;
  f.app.store.touchConversation({id:'A',cwd:f.home,prompt:'test',turnId:'turn'});
  await observeHook(f.app,{session_id:'A',cwd:f.home,turn_id:'turn',tool_name:'Bash',tool_input:{command:`echo cat ${path}`},tool_response:{exit_code:0}});
  assert.equal(f.app.store.stats()[id],undefined);
  await observeHook(f.app,{session_id:'A',cwd:f.home,turn_id:'turn',tool_name:'Bash',tool_input:{command:`cat '${path}'`},tool_response:{exit_code:1}});
  assert.equal(f.app.store.stats()[id],undefined);
  const e={session_id:'A',cwd:f.home,turn_id:'turn',tool_name:'Bash',tool_input:{command:`cat '${path}'`},tool_response:{exit_code:0}};
  await observeHook(f.app,e);await observeHook(f.app,e);await f.app.load('A',id,'turn');assert.equal(f.app.store.stats()[id].loaded,1);
  await observeHook(f.app,{...e,turn_id:'next',tool_name:'exec_command',tool_input:{cmd:`cat '${path}'`}});assert.equal(f.app.store.stats()[id].loaded,2);
});
test('repository cache groups requests, preserves last good value on failure and never fabricates zero',async t=>{
  const f=await fixture(t);await f.skill('one','one');await f.skill('two','two');const {skills}=await f.app.catalog.scan();for(const s of skills)await f.app.preference(s.id,{repo:'owner/repo'});
  let requests=0;const fetcher=async()=>{requests++;return {ok:true,json:async()=>({stargazers_count:45})};};
  await f.app.stars({fetcher});await f.app.stars({fetcher});assert.equal(requests,1);assert.equal(f.app.store.repo('owner/repo').stars,45);
  await f.app.stars({force:true,fetcher:async()=>{throw new Error('offline');}});assert.equal(f.app.store.repo('owner/repo').stars,45);assert.equal(f.app.store.repo('owner/repo').status,'error');
});

test('browser ambient text cannot influence recommendations or stored Hook task',async t=>{
  const f=await fixture(t);await f.skill('frontend-design','Design frontend UI in the browser');await f.skill('pdf','Read PDF documents');
  const ambient='<in-app-browser-context source="ambient-ui-state">\nUI browser design supplied not user. Current URL: http://localhost/?category=design\n</in-app-browser-context>';
  const wrapped=ambient+'\n\n## My request:\n请读取 PDF 文档';
  const {skills}=await f.app.catalog.scan();assert.deepEqual(recommend(skills,wrapped),recommend(skills,'请读取 PDF 文档'));assert.deepEqual(recommend(skills,ambient),[]);
  assert.equal(skills.find(s=>s.id===recommend(skills,wrapped)[0].id).name,'pdf');
  await promptHook(f.app,{session_id:'clean',cwd:f.home,prompt:wrapped,turn_id:'one'});
  assert.equal(f.app.store.conversation('clean').prompt,'请读取 PDF 文档');
  // Previously persisted polluted text is cleaned when read, including short follow-ups.
  f.app.store.touchConversation({id:'old',cwd:f.home,prompt:wrapped});f.app.store.setSetting('task:old',wrapped);
  const old=await f.app.snapshot({conversationId:'old',runtime:false});assert.equal(old.conversation.prompt,'请读取 PDF 文档');assert.equal(old.conversations.find(c=>c.id==='old').prompt,'请读取 PDF 文档');
  await promptHook(f.app,{session_id:'old',cwd:f.home,prompt:'继续',turn_id:'two'});assert.ok(!f.app.store.setting('recommend:old').includes(skills.find(s=>s.name==='frontend-design').id));
  const empty=await promptHook(f.app,{session_id:'empty',cwd:f.home,prompt:ambient,turn_id:'three'});assert.doesNotMatch(empty.hookSpecificOutput.additionalContext,/本轮出现/);
});
test('conversation states distinguish saved selection, delivered instructions and observed reads',async t=>{
  const f=await fixture(t);const path=await f.skill('demo','Task workflow');const id=(await f.app.catalog.scan()).skills[0].id;
  for(const chat of ['A','B'])f.app.store.touchConversation({id:chat,cwd:f.home,prompt:'task'});
  const state=async chat=>(await f.app.snapshot({conversationId:chat,runtime:false})).skills[0].conversationState;
  await f.app.select('A',[id]);assert.deepEqual(await state('A'),{selected:true,deliveredAt:null,readAt:null});
  await promptHook(f.app,{session_id:'A',cwd:f.home,prompt:'continue',turn_id:'one'});
  assert.ok((await state('A')).deliveredAt);assert.equal((await state('A')).readAt,null);
  await observeHook(f.app,{session_id:'A',cwd:f.home,turn_id:'one',tool_name:'exec_command',tool_input:{cmd:`cat '${path}'`},tool_response:{exit_code:0}});
  assert.ok((await state('A')).readAt);assert.deepEqual(await state('B'),{selected:false,deliveredAt:null,readAt:null});
  await f.app.load('B',id,'two');assert.ok((await state('B')).deliveredAt);assert.ok((await state('B')).readAt);assert.equal((await state('B')).selected,false);
  await f.app.select('A',[]);assert.equal((await state('A')).selected,false);assert.ok((await state('A')).deliveredAt,'clearing selection cannot retract historical delivery');
});
