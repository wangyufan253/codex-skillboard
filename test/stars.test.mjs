import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { fixture } from './helpers.mjs';
import { fingerprint,refreshSources,HOUR } from '../server/sources.mjs';

test('source discovery requires exact public file fingerprints, preserves overrides and caches lookups',async t=>{
  const f=await fixture(t),path=await f.skill('local-name','Workflow with https://github.com/other/tool'),text=await readFile(path,'utf8');
  assert.equal((await f.app.catalog.scan(true)).skills[0].repo,null,'body links and names are not provenance');
  let requests=0;
  const fetcher=async url=>{requests++;return {ok:true,json:async()=>({tree:url.includes('orchestra-research/')?[{type:'blob',path:'skills/demo/SKILL.md',sha:fingerprint(text)}]:[]})};};
  assert.deepEqual(await refreshSources(f.app.store,fetcher),[]);
  const count=requests;await refreshSources(f.app.store,fetcher);assert.equal(requests,count,'source trees refresh at most once per day');
  const s=(await f.app.catalog.scan(true)).skills[0];assert.equal(s.repo,'orchestra-research/ai-research-skills');assert.match(s.repoEvidence,/哈希一致/);
  await writeFile(path,text+'\nModified locally.');assert.equal((await f.app.catalog.scan(true)).skills[0].repo,null,'edited files cannot inherit a fingerprint match');
  await f.app.preference(s.id,{repo:'owner/manual'});assert.equal((await f.app.catalog.scan(true)).skills[0].repo,'owner/manual');
});

test('Stars sync coalesces simultaneous runs, expires hourly and waits after rate limiting',async t=>{
  const f=await fixture(t);await f.skill('one','Workflow');const id=(await f.app.catalog.scan()).skills[0].id;await f.app.preference(id,{repo:'owner/repo'});
  let requests=0,release;const fetcher=async()=>{requests++;await new Promise(r=>release=r);return {ok:true,json:async()=>({stargazers_count:123})};};
  const one=f.app.stars({fetcher}),two=f.app.stars({force:true,fetcher});assert.equal(one,two);
  while(!release)await new Promise(r=>setImmediate(r));release();await one;assert.equal(requests,1);
  await f.app.stars({fetcher});assert.equal(requests,1);
  f.app.store.db.prepare('UPDATE repos SET checkedAt=?').run(new Date(Date.now()-HOUR-1).toISOString());
  let attempts=0;await f.app.stars({fetcher:async()=>{attempts++;return {ok:false,status:429,headers:new Headers({'retry-after':'7200'})};}});
  assert.equal(attempts,1);assert.equal(f.app.store.repo('owner/repo').stars,123);
  await assert.rejects(f.app.stars({force:true,fetcher}),/限流/);assert.equal(requests,1);
  assert.ok(f.app.store.setting('githubRetryAt')>Date.now()+HOUR);
});

test('automatic sync starts immediately, repeats hourly and starts only once',async t=>{
  const f=await fixture(t),scheduled=[];let runs=0;
  f.app.stars=async()=>{runs++;};const schedule=(fn,delay)=>{scheduled.push({fn,delay});return {unref(){}};};
  f.app.startStarsSync({schedule});f.app.startStarsSync({schedule});assert.equal(scheduled.length,1);assert.equal(scheduled[0].delay,0);
  await scheduled[0].fn();assert.equal(runs,1);assert.equal(scheduled[1].delay,HOUR);assert.ok(f.app.starsNextAt);
  await scheduled[1].fn();assert.equal(runs,2);assert.equal(scheduled[2].delay,HOUR);
});
