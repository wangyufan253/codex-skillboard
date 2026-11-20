const root=document.getElementById('skill-compact');
const $=s=>root.querySelector(s);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const summaries={'frontend-design':'设计页面布局、排版与交互。',impeccable:'检查并调整间距、层级和交互细节。','design-taste-frontend':'减少模板化表达，统一视觉与文案。','find-skills':'查找、发现并安装适合任务的 Skill。','nature-figure':'创建和检查论文图表。','nature-reader':'生成中英对照的论文阅读材料。','nature-writing':'根据已有证据组织论文内容。','ml-paper-writing':'撰写和修改机器学习论文。','frontend-slides':'制作 HTML 演示文稿。','ppt-master':'创建和编辑 PowerPoint 演示文稿。','job-application-assistant':'评估岗位、调整简历并准备面试。',hallmark:'设计网站与新页面的视觉方案。'};
const query=new URLSearchParams(location.search);
let conversationId=query.get('conversation')||'',projectId=query.get('project')||'',category=query.get('category')||'all',page=0,token='',data=null,detailId=null,requestNumber=0,loading=false,notice='';
const drafts=new Map();
const collectionOpen=new Map(),collectionLimits=new Map();
const pageSize=12;
$('#sc-layout').value=query.get('layout')==='flat'?'flat':'collections';
const selected=()=>drafts.get(conversationId)||new Set(data?.conversation?.selection||[]);
const skill=id=>data?.skills.find(s=>s.id===id);
const categoryName=id=>data?.categories.find(c=>c.id===id)?.label||'其他';
const dirty=()=>{const saved=new Set(data?.conversation?.selection||[]),draft=selected();return saved.size!==draft.size||[...draft].some(id=>!saved.has(id));};
function alertMessage(message){$('#app-alert').textContent=message;$('#app-alert').hidden=!message;}
async function api(path,{method='GET',body}={}){const res=await fetch(path,{method,headers:method==='POST'?{'Content-Type':'application/json','X-Workbench-Token':token}:{},...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await res.json();if(!res.ok)throw new Error(result.error||'操作未完成');return result;}
function rememberRoute(){const p=new URLSearchParams();if(conversationId)p.set('conversation',conversationId);else if(projectId)p.set('project',projectId);if(category!=='all')p.set('category',category);if($('#sc-layout').value==='flat')p.set('layout','flat');history.replaceState(null,'',location.pathname+(p.size?'?'+p:''));}
async function refresh(force=false){
  const number=++requestNumber,target=conversationId;
  const p=new URLSearchParams({conversation:target,days:$('#period').value});if(force)p.set('refresh','1');
  const next=await api('/api/state?'+p);
  if(number!==requestNumber||target!==conversationId)return;
  data=next;
  if(!drafts.has(target))drafts.set(target,new Set(next.conversation?.selection||[]));
  render();alertMessage('');
}
function card(s){
  const chosen=selected().has(s.id),input=`skill-${s.id}`;
  const state=s.conversationState,selectionLabel=chosen!==state.selected?(chosen?'待保存选用':'待保存移除'):state.selected?'本对话已选':'本对话未选';
  const evidence=data.conversation?`<div class="sc-evidence" aria-label="本对话状态"><span data-state="selection" data-active="${state.selected}">${selectionLabel}</span><span data-state="delivery" data-active="${!!state.deliveredAt}" title="本对话累计记录：${state.deliveredAt?'最近交付 '+new Date(state.deliveredAt).toLocaleString():'尚无交付记录'}；交付表示 Hook 输出或 MCP 返回了完整说明，不代表执行成功。">${state.deliveredAt?'说明已交付':'说明未交付'}</span><span data-state="read" data-active="${!!state.readAt}" title="${state.readAt?'本对话最近观察到读取：'+new Date(state.readAt).toLocaleString():'本对话尚无可确认的读取记录；不代表一定未使用。'}">${state.readAt?'观察到读取':'未观察到读取'}</span></div>`:'<div class="sc-evidence">绑定对话后查看选用、交付与读取状态</div>';
  const loaded=s.stats.loaded,statsTitle=`所有对话统计：说明交付 ${s.stats.delivered} 次；观察到读取 ${loaded} 次；明确选用 ${s.stats.selected} 次；Hook 输出说明 ${s.stats.injected} 次。未观察到不代表未使用。`;
  const starsTitle=s.repo?`来源仓库 ${s.repo}${s.stars?.stars!=null?'，Stars '+s.stars.stars.toLocaleString('en'):''}${s.stars?.checkedAt?'，检查于 '+new Date(s.stars.checkedAt).toLocaleString():''}${s.stars?.status==='error'?'；最近更新失败：'+s.stars.error:''}`:'未找到可核验的来源仓库；本地自建或修改过的 Skill 可能没有匹配，可在详情关联';
  const starsLabel=!s.repo?'未关联仓库':s.stars?.stars!=null?'Stars '+s.stars.stars.toLocaleString('en')+(s.stars.status==='error'?' · 更新失败':''):s.stars?.status==='error'?'Stars 更新失败':'Stars 待同步';
  return `<article class="sc-card" data-card="${s.id}" data-selected="${chosen}" aria-label="${escape(s.name)}，${s.directory}"><div class="sc-card-header"><input class="sc-check" id="${input}" type="checkbox" data-skill="${s.id}" aria-label="为本对话选择 ${escape(s.name)}" ${chosen?'checked':''} ${!data.conversation?'disabled':''}><label class="sc-name" for="${input}">${escape(s.name)}</label></div><p class="sc-desc" title="${escape(s.description)}">${escape(summaries[s.name]||s.description)}</p>${s.registered===false?'<div class="app-discovery">仅磁盘可见，Codex 未发现</div>':''}<div class="sc-meta"><span class="sc-category" data-category="${s.category}" title="${s.directory}；${s.categoryInferred?'按用途自动归类':'手动分类'}">${categoryName(s.category)}</span><span class="sc-stats"><span title="${escape(starsTitle)}">${escape(starsLabel)}</span></span></div><div class="sc-metrics" title="${escape(statsTitle)}"><span data-metric="delivered">累计交付 ${s.stats.delivered}</span><span data-metric="reads">累计读取 ${loaded}</span></div>${evidence}<div class="sc-global"><button type="button" class="sc-text-btn app-detail-button" data-detail="${s.id}">详情</button><label title="全局候选开关：开启表示可供 Codex 选用，不代表已加载；Skill 自身的调用策略仍生效。"><span>允许自动选用</span><input class="sc-switch" role="switch" type="checkbox" data-global="${s.id}" aria-label="允许自动选用 ${escape(s.name)}" ${s.globalEnabled?'checked':''}></label></div><div class="sc-temporary" ${chosen&&!s.globalEnabled?'':'hidden'}>仅本对话临时选用</div></article>`;
}
function renderCategories(){
  if(!data.categories.some(c=>c.id===category))category='all';
  $('#sc-categories').innerHTML=[{id:'all',label:'全部'},...data.categories].map(c=>`<button type="button" class="sc-category-filter" data-category="${c.id}" aria-pressed="${c.id===category}">${c.label}<span class="sc-category-count">${c.id==='all'?data.skills.length:data.skills.filter(s=>s.category===c.id).length}</span></button>`).join('');
}
function collectionKey(repo){return $('#sc-search').value.trim().toLowerCase()+'|'+repo;}
function collection(group){
  const members=data.skills.filter(s=>s.repo===group.repo),key=collectionKey(group.repo),open=collectionOpen.get(key)??!!$('#sc-search').value.trim(),limit=collectionLimits.get(key)||pageSize;
  const count=members.filter(s=>selected().has(s.id)).length,saved=members.filter(s=>s.conversationState.selected).length;
  const names={'orchestra-research/ai-research-skills':'AI Research Skills','yuan1z0825/nature-skills':'Nature Skills'};
  const label=names[group.repo]||group.repo.split('/')[1];
  const stats=group.items[0].stars;
  return `<details class="sc-collection" data-collection="${escape(group.repo)}" ${open?'open':''}><summary data-collection-toggle="${escape(group.repo)}"><span class="sc-collection-title"><strong>${escape(label)}</strong><span>${escape(group.repo)}</span></span><span class="sc-collection-meta"><span>${group.items.length===members.length?members.length+' 项':`匹配 ${group.items.length}/${members.length} 项`}</span><span>${count===saved?'本对话已选':'待保存选用'} ${count} 项</span>${stats?.stars!=null?`<span title="整个来源仓库的 Stars，合集内各项共享此数值">Stars ${stats.stars.toLocaleString('en')}</span>`:''}</span></summary>${open?`<div class="sc-grid sc-collection-grid">${group.items.slice(0,limit).map(s=>card(s)).join('')}</div>${group.items.length>limit?`<div class="sc-collection-more"><button class="sc-text-btn" type="button" data-collection-more="${escape(group.repo)}">再显示 ${Math.min(pageSize,group.items.length-limit)} 项</button><span>已展示 ${Math.min(limit,group.items.length)}/${group.items.length} 项</span></div>`:''}`:''}</details>`;
}
function renderGrid(){
  if(!data)return;
  const term=$('#sc-search').value.trim().toLowerCase(),directory=$('#sc-directory').value,sort=$('#sc-sort').value;
  const byName=(a,b)=>a.name.localeCompare(b.name)||a.directory.localeCompare(b.directory);
  const list=data.skills.filter(s=>(category==='all'||s.category===category)&&(directory==='all'||s.directory===directory)&&`${s.name} ${s.description} ${s.repo||''} ${summaries[s.name]||''} ${categoryName(s.category)}`.toLowerCase().includes(term));
  list.sort((a,b)=>sort==='delivered'?b.stats.delivered-a.stats.delivered||byName(a,b):sort==='usage'?b.stats.loaded-a.stats.loaded||byName(a,b):sort==='selected'?b.stats.selected-a.stats.selected||byName(a,b):sort==='stars'?(b.stars?.stars??-1)-(a.stars?.stars??-1)||byName(a,b):byName(a,b));
  const grouped=$('#sc-layout').value==='collections',units=[],groups=new Map();
  const sizes=new Map();for(const s of data.skills)if(s.repo)sizes.set(s.repo,(sizes.get(s.repo)||0)+1);
  for(const s of list){if(grouped&&s.repo&&sizes.get(s.repo)>1){let group=groups.get(s.repo);if(!group){group={repo:s.repo,items:[]};groups.set(s.repo,group);units.push(group);}group.items.push(s);}else units.push({skill:s});}
  const pages=Math.max(1,Math.ceil(units.length/pageSize));page=Math.min(page,pages-1);
  $('#sc-all-grid').innerHTML=units.length?units.slice(page*pageSize,(page+1)*pageSize).map(unit=>unit.skill?card(unit.skill):collection(unit)).join(''):'<div class="sc-empty">没有匹配项。请调整分类、关键词或目录。</div>';
  $('#sc-result-count').textContent=`${list.length} 项个人安装 Skill${groups.size?`，收纳为 ${groups.size} 个合集，其余单独展示`:''}${sort==='stars'?'；暂无 Stars 的项排在末尾':''}`;
  $('#sc-range').textContent=units.length?`${page*pageSize+1}–${Math.min((page+1)*pageSize,units.length)} / ${units.length}${groups.size?' 个合集或独立项':''}`:'0 项';
  $('#sc-page-number').textContent=`${page+1} / ${pages}`;$('#sc-prev').disabled=page===0;$('#sc-next').disabled=page>=pages-1;
  $('#sc-total-count').textContent=data.skills.length;
  renderSelection();
}
function renderSelection(){
  const ids=selected(),saved=data?.conversation?.selection.length||0;
  $('#sc-selection').innerHTML=`本对话已选 <strong>${saved}</strong> 项${dirty()?` <span>（待保存：${ids.size} 项）</span>`:''}`;
  $('#sc-evidence-summary').textContent=data?.conversation?`说明已交付 ${data.skills.filter(s=>s.conversationState.deliveredAt).length} 项 · 观察到读取 ${data.skills.filter(s=>s.conversationState.readAt).length} 项（本对话累计）`:'绑定对话后查看交付与读取记录';
  $('#sc-chips').hidden=!ids.size;$('#sc-chips').innerHTML=[...ids].map(id=>`<span class="sc-chip">${escape(skill(id)?.name||'已移走的 Skill')}<button type="button" data-remove="${id}" aria-label="取消选择 ${escape(skill(id)?.name||id)}">移除</button></span>`).join('');
  $('#sc-clear').disabled=loading||!ids.size;$('#sc-save').disabled=loading||!data?.conversation||!dirty();
  $('#sc-status').textContent=notice||(!data?.conversation?'请绑定 Codex 对话后再保存选择。':dirty()?'有未保存的选择，保存后才会应用。':!data.integration.configured?'选择仅保存在工作台；尚未安装 Codex 接入，不会应用到聊天。':!data.conversation.lastHook?'请先在 Codex 中查看并信任新增 Hook，再在本对话发一条消息。':data.conversation.selectionVersion>data.conversation.injectedVersion?'已保存；等待该对话下一条消息交付所选说明。':!saved?'本对话尚未选用 Skill；勾选并保存后交付说明。':'Hook 已运行；各项说明是否交付、是否观察到读取，请看卡片记录。');
}
function renderConnection(){
  const sync=data.starsSync||{},linked=data.skills.filter(s=>s.repo).length,failed=data.skills.filter(s=>s.stars?.status==='error').length;
  const time=iso=>new Date(iso).toLocaleString();
  $('#stars-status').textContent=[sync.running?'正在核验来源并同步 Stars…':sync.automatic?'Stars 每小时自动更新（本地服务运行期间）':'Stars 手动更新',`已关联 ${linked}/${data.skills.length} 项`,sync.checkedAt?'最近检查 '+time(sync.checkedAt):'尚未检查',sync.nextAt?'下次 '+time(sync.nextAt):'',sync.retryAt>Date.now()?'GitHub 限流，恢复后重试':'',failed?`${failed} 项最近刷新失败，保留已有数值`:'',sync.sourceErrors?.length?`${sync.sourceErrors.length} 个来源索引更新失败，保留已有指纹`:'',sync.error||''].filter(Boolean).join(' · ');
  $('#sync-stars').disabled=!!sync.running;
  const hooked=data.conversation?.lastHook;
  $('#connection-summary').textContent=hooked?'本对话 Hook 已运行':data.integration.configured?'已配置 Codex 接入；等待 Hook 运行':'Codex 接入尚未安装';
  const lines=[data.integration.configured?'MCP 与 Hook 配置已安装。':'在项目目录运行 npm run install:codex 安装 MCP 与 Hook。',hooked?'最近接收：'+new Date(hooked).toLocaleString():'在 Codex 中选择 Review hooks，或打开 设置 > Hooks 查看并信任新增的两个 Hook。信任由 Codex 管理，工作台不会自动批准。',data.runtimeStatus.verified?'当前工作目录的发现状态已通过新的 Codex 运行时验证；不代表已有聊天已即时刷新。':'无法验证 Codex 当前发现状态：'+(data.runtimeStatus.error||'未连接')];
  if(data.errors.length)lines.push(`${data.errors.length} 项目录或元数据问题：`+data.errors.map(e=>e.path+'：'+e.message).join('\n'));
  $('#connection-details').textContent=lines.join('\n\n');
  $('#coverage').textContent=`允许自动选用不代表已加载。交付与读取状态为本对话累计记录，清除选择不会撤回历史说明；交付表示 Hook 输出或 MCP 返回完整说明，不代表执行成功。读取观测可能漏记。卡片累计读取和排行榜覆盖所有对话，统计开始于 ${data.statistics.since?new Date(data.statistics.since).toLocaleDateString():'本次安装'}；Stars 为来源仓库热度。`;
}
function render(){
  root.dataset.conversation=data.conversation?.id||'';
  if(data.conversation)projectId=data.conversation.projectId;
  if(!data.projects.some(p=>p.id===projectId))projectId='';
  $('#project').innerHTML='<option value="">请选择项目</option>'+data.projects.map(p=>`<option value="${escape(p.id)}">${escape(p.name)}（${p.conversationCount}）</option>`).join('');
  $('#project').value=projectId;
  const chats=data.conversations.filter(c=>c.projectId===projectId);
  $('#conversation').innerHTML=`<option value="">${!projectId?'请先选择项目':chats.length?'请选择对话':'此项目暂无本地对话'}</option>`+chats.map(c=>{
    const duplicate=chats.filter(other=>other.title===c.title).length>1;
    return `<option value="${escape(c.id)}">${escape(c.title)}${duplicate?'（'+new Date(c.lastSeen).toLocaleString()+'）':''}</option>`;
  }).join('');
  $('#conversation').value=conversationId;
  $('#conversation').disabled=!chats.length;
  $('#conversation').title=data.conversation?.title||'不绑定对话时，只能查询和管理全局配置';
  $('#project').title=data.projects.find(p=>p.id===projectId)?.roots.join('\n')||'先选项目，再选对话';
  $('#conversation-scope').textContent='Skill 选择仅应用于选中的对话。'+(!data.conversationDirectoryStatus.verified?' 无法获取最新项目和对话名称，暂用本地已知记录。':'');
  $('#conversation-info').hidden=!data.conversation;
  $('#conversation-info-content').textContent=data.conversation?`项目：${data.conversation.projectName}\n对话：${data.conversation.title}\n${data.conversation.cwd}\n项目归组依据：${data.conversation.projectGrouping==='project'?'Codex 项目归属':'工作目录匹配'}\n对话 ID：${data.conversation.id}`:'';
  renderCategories();renderGrid();renderConnection();rememberRoute();
}
function toggle(id){notice='';if(!data?.conversation){alertMessage('请先绑定一个 Codex 对话。');return;}const ids=new Set(selected());if(ids.has(id))ids.delete(id);else if(ids.size>=24){alertMessage('每个对话最多选择 24 个 Skill，请先移除部分选择。');renderGrid();return;}else ids.add(id);drafts.set(conversationId,ids);renderGrid();}
async function action(button,callback){loading=true;if(button)button.disabled=true;try{await callback();alertMessage('');}catch(e){alertMessage(e.message);}finally{loading=false;renderSelection();if(button&&button.id!=='sc-save'&&button.id!=='sc-clear')button.disabled=false;}}
root.addEventListener('click',event=>{
  const t=event.target,cat=t.closest('.sc-category-filter'),remove=t.closest('[data-remove]'),detail=t.closest('[data-detail]');
  const fold=t.closest('[data-collection-toggle]'),more=t.closest('[data-collection-more]');
  if(fold){event.preventDefault();const repo=fold.dataset.collectionToggle;collectionOpen.set(collectionKey(repo),!fold.parentElement.open);renderGrid();[...root.querySelectorAll('[data-collection-toggle]')].find(el=>el.dataset.collectionToggle===repo)?.focus();return;}
  if(more){const repo=more.dataset.collectionMore,key=collectionKey(repo),before=collectionLimits.get(key)||pageSize;collectionLimits.set(key,before+pageSize);renderGrid();const next=[...root.querySelectorAll('[data-collection]')].find(el=>el.dataset.collection===repo)?.querySelectorAll('[data-card]')[before];next?.querySelector('[data-skill]:enabled,[data-detail]')?.focus();return;}
  if(cat){category=cat.dataset.category;page=0;renderCategories();renderGrid();rememberRoute();return;}
  if(remove){notice='';const ids=new Set(selected());ids.delete(remove.dataset.remove);drafts.set(conversationId,ids);renderGrid();return;}
  if(detail){openDetail(detail.dataset.detail);return;}
  if(t.closest('button,input,label,select,a,dialog'))return;
  const c=t.closest('[data-card]');if(c)toggle(c.dataset.card);
});
root.addEventListener('change',async event=>{
  const t=event.target;
  if(t.dataset.skill){toggle(t.dataset.skill);return;}
  if(t.dataset.global){const id=t.dataset.global,enabled=t.checked;t.disabled=true;await action(null,async()=>{const r=await api('/api/global',{method:'POST',body:{skillId:id,enabled}});await refresh(true);notice=r.message;});if(data)renderGrid();return;}
  if(t.id==='project'){notice='';projectId=t.value;conversationId='';page=0;$('#conversation-info').open=false;data={...data,conversation:null};render();rememberRoute();await action(t,()=>refresh());return;}
  if(t.id==='conversation'){notice='';conversationId=t.value;page=0;data={...data,conversation:null};render();rememberRoute();await action(t,()=>refresh());return;}
  if(t.id==='sc-directory'||t.id==='sc-sort'||t.id==='sc-layout'){page=0;renderGrid();rememberRoute();return;}
  if(t.id==='period')await action(t,()=>refresh());
});
$('#sc-search').addEventListener('input',()=>{page=0;renderGrid();});
$('#sc-prev').addEventListener('click',()=>{page=Math.max(0,page-1);renderGrid();});
$('#sc-next').addEventListener('click',()=>{page++;renderGrid();});
$('#sc-clear').addEventListener('click',()=>{notice='';drafts.set(conversationId,new Set());renderGrid();});
$('#sc-save').addEventListener('click',()=>action($('#sc-save'),async()=>{const target=conversationId;await api('/api/selection',{method:'POST',body:{conversationId:target,skillIds:[...selected()]}});drafts.delete(target);await refresh();}));
$('#refresh').addEventListener('click',()=>action($('#refresh'),()=>refresh(true)));
$('#sync-stars').addEventListener('click',()=>action($('#sync-stars'),async()=>{const r=await api('/api/stars',{method:'POST',body:{}});await refresh();notice=`Stars 已刷新 ${r.updated}/${r.repositories} 个仓库；${r.unknown} 项尚未关联仓库。${r.failed?` ${r.failed} 个请求失败，保留已有数值：`+r.errors.map(e=>e.repo+'：'+e.message).join('；'):''}${r.sourceErrors?.length?' 来源索引刷新有失败，已有指纹仍可识别。':''}`;}));
function openDetail(id){
  const s=skill(id);if(!s)return;detailId=id;
  $('#detail-title').textContent=s.name;$('#detail-description').textContent=s.description;$('#detail-path').textContent=s.path;
  const state=s.conversationState;
  $('#detail-stats').textContent=`${s.directory}。${data.conversation?`本对话：${state.selected?'已选':'未选'}；${state.deliveredAt?'说明最近交付于 '+new Date(state.deliveredAt).toLocaleString():'说明未交付'}；${state.readAt?'最近观察到读取于 '+new Date(state.readAt).toLocaleString():'未观察到读取'}。`:'未绑定对话。'} 所有对话累计：明确选用 ${s.stats.selected} 次；观察到读取 ${s.stats.loaded} 次；Hook 输出说明 ${s.stats.injected} 次。交付与读取均不代表执行成功。`;
  $('#detail-category').innerHTML=data.categories.map(c=>`<option value="${c.id}">${c.label}</option>`).join('');$('#detail-category').value=s.category;$('#detail-repo').value=s.repo||'';
  $('#detail-source').textContent=(s.categoryInferred?'分类按名称和用途归纳，可在此修正。':'已使用手动分类。')+' '+(s.repo?`来源依据：${s.repoEvidence}。`:'尚未找到可核验的来源，可填写仓库；留空按安装记录与公开文件指纹识别。')+(s.stars?.status==='error'?' Stars 更新失败：'+s.stars.error:'');
  $('#detail-status').textContent='';$('#skill-source').hidden=true;$('#skill-source').textContent='';$('#skill-dialog').showModal();
}
$('#detail-close').addEventListener('click',()=>$('#skill-dialog').close());
$('#detail-form').addEventListener('submit',async event=>{event.preventDefault();const b=$('#save-detail');b.disabled=true;try{await api('/api/preference',{method:'POST',body:{skillId:detailId,category:$('#detail-category').value,repo:$('#detail-repo').value}});await refresh(true);$('#detail-status').textContent='分类与来源已保存。';}catch(e){$('#detail-status').textContent=e.message;}finally{b.disabled=false;}});
$('#view-source').addEventListener('click',async()=>{try{const r=await api('/api/content?id='+encodeURIComponent(detailId));$('#skill-source').textContent=r.text;$('#skill-source').hidden=false;}catch(e){$('#detail-status').textContent=e.message;}});
try{
  const b=await api('/api/bootstrap');token=b.token;
  await refresh(true);
  setInterval(()=>{if(!loading&&!$('#skill-dialog').open&&!root.querySelector('input:focus,select:focus,summary:focus,button:focus'))refresh().catch(e=>alertMessage('无法刷新本机数据：'+e.message));},7000);
}catch(e){alertMessage('本机数据加载失败：'+e.message+'。请检查服务后点击刷新目录。');$('#sc-all-grid').innerHTML='<div class="sc-empty">无法连接工作台。检查服务后重试。</div>';}
