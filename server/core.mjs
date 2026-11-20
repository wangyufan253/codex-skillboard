import { Store } from './store.mjs';
import { Catalog, categories, normalizeRepo, hash } from './catalog.mjs';
import { CodexClient } from './codex.mjs';
import { recommend, userTask } from './recommend.mjs';
import { paths, webUrl } from './paths.mjs';
import { conversationDirectory } from './conversations.mjs';
export class Workbench {
  constructor(config=paths()){this.config=config;this.store=new Store(config.data);if(!this.store.setting('trackingSince'))this.store.setSetting('trackingSince',new Date().toISOString());this.catalog=new Catalog(config,this.store);this.codex=new CodexClient(config);this.runtimeCache=new Map();}
  close(){this.codex.close();this.store.close();}
  async conversations(currentId='',refresh=false){
    if(refresh||!this.directoryCache||Date.now()-this.directoryCache.at>30000){
      try{this.directoryCache={...(await this.codex.conversationDirectory()),at:Date.now(),verified:true,error:null};}
      catch(e){this.directoryCache={projects:[],threads:[],...this.directoryCache,at:Date.now(),verified:false,error:e.message};}
    }
    const known=this.store.conversations(),current=this.store.conversation(currentId);
    if(current&&!known.some(c=>c.id===current.id))known.unshift(current);
    return {...conversationDirectory(this.directoryCache,known,currentId),status:{verified:this.directoryCache.verified,error:this.directoryCache.error}};
  }
  async snapshot({conversationId='',task='',refresh=false,runtime=true,days=30}={}){
    const directory=await this.conversations(conversationId,refresh),entry=directory.conversations.find(c=>c.id===conversationId);
    if(entry&&!this.store.conversation(conversationId))this.store.touchConversation({id:entry.id,cwd:entry.cwd,prompt:entry.prompt});
    const base=await this.catalog.scan(refresh),catalog={...base,skills:base.skills.map(s=>({...s}))},c=this.store.conversation(conversationId),cwd=c?.cwd||this.config.home;
    let runtimeStatus={verified:false,error:null};
    if(runtime){
      try{let cached=this.runtimeCache.get(cwd);if(refresh||!cached||Date.now()-cached.at>30000){cached={...(await this.codex.registered(cwd)),at:Date.now()};this.runtimeCache.set(cwd,cached);}runtimeStatus={verified:true,error:null,errors:cached.errors};for(const s of catalog.skills){const r=cached.data.get(s.realPath);s.registered=!!r;s.runtimeEnabled=r?.enabled??null;}}
      catch(e){runtimeStatus.error=e.message;}
    }
    const stats=this.store.stats(days),preferences=this.store.preferences(),evidence=this.store.conversationEvidence(conversationId);
    const skills=catalog.skills.map(s=>({...s,conversationState:{selected:!!c?.selection.includes(s.id),deliveredAt:evidence[s.id]?.deliveredAt||null,readAt:evidence[s.id]?.readAt||null},stats:{loaded:stats[s.id]?.loaded||0,selected:stats[s.id]?.selected||0,injected:stats[s.id]?.injected||0},stars:s.repo?this.store.repo(s.repo):null}));
    return {...catalog,skills,categories,conversation:c?{...c,...entry,prompt:userTask(c.prompt)}:null,conversations:directory.conversations,projects:directory.projects,conversationDirectoryStatus:directory.status,recommendations:recommend(skills,task||c?.prompt||''),runtimeStatus,url:webUrl(conversationId,this.config),statistics:{since:this.store.setting('trackingSince'),days,coverage:'MCP 返回说明及 Hook 可确认的文件读取；不覆盖全部使用'},integration:{...this.store.setting('integration',{}),hookObserved:!!c?.lastHook},preferences};
  }
  async select(conversationId,ids){
    if(!Array.isArray(ids)||ids.length>24||!ids.every(id=>typeof id==='string'))throw new Error('每个对话最多选择 24 个 Skill');
    for(const id of ids)await this.catalog.get(id);
    const c=this.store.saveSelection(conversationId,ids);
    return {conversation:c,status:'saved-awaiting-next-message',message:'已保存，将在该对话下一条消息时交给 Codex。'};
  }
  async load(conversationId,id,turnId){
    const c=this.store.conversation(conversationId);if(!c)throw new Error('缺少已绑定的对话，请先从工作台选择对话');
    const {skill,text}=await this.catalog.content(id);const turn=turnId||c.turnId||'manual-'+Date.now();
    this.store.event({key:`loaded:${conversationId}:${turn}:${id}`,kind:'loaded',conversationId,turnId:turn,skillId:id,evidence:'MCP 已返回完整 SKILL.md'});
    return {skill,text};
  }
  async preference(id,{category,repo}){
    await this.catalog.get(id);
    if(category!==undefined&&category!==null&&!categories.some(c=>c.id===category))throw new Error('未知分类');
    if(repo!==undefined&&repo!==null&&repo!==''&&!normalizeRepo(repo))throw new Error('请填写 GitHub 的 owner/repo 或仓库首页地址');
    this.store.preference(id,{category,repo:repo===undefined?undefined:normalizeRepo(repo)});await this.catalog.scan(true);
  }
  async stars({force=false,fetcher=fetch}={}){
    const {skills}=await this.catalog.scan();const repos=[...new Set(skills.map(s=>s.repo).filter(Boolean))];let updated=0;
    for(const repo of repos){const cached=this.store.repo(repo);if(!force&&cached&&Date.now()-Date.parse(cached.checkedAt)<86400000)continue;
      try{const response=await fetcher('https://api.github.com/repos/'+repo,{headers:{Accept:'application/vnd.github+json','User-Agent':'local-skill-workbench/0.1'},signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error(response.status===403||response.status===429?'GitHub 请求额度已用尽':'GitHub 返回 '+response.status);const data=await response.json();if(!Number.isSafeInteger(data.stargazers_count)||data.stargazers_count<0)throw new Error('仓库热度响应无效');this.store.saveRepo(repo,{stars:data.stargazers_count,status:'ok'});updated++;}
      catch(e){this.store.saveRepo(repo,{status:'error',error:e.message});}
    }
    return {repositories:repos.length,updated};
  }
}
