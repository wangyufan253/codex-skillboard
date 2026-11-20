import { Store } from './store.mjs';
import { Catalog, categories, normalizeRepo, hash } from './catalog.mjs';
import { CodexClient } from './codex.mjs';
import { userTask } from './messages.mjs';
import { paths, webUrl } from './paths.mjs';
import { conversationDirectory } from './conversations.mjs';
import { HOUR,githubJson,refreshSources } from './sources.mjs';
export class Workbench {
  constructor(config=paths()){this.config=config;this.store=new Store(config.data);if(!this.store.setting('trackingSince'))this.store.setSetting('trackingSince',new Date().toISOString());this.catalog=new Catalog(config,this.store);this.codex=new CodexClient(config);this.runtimeCache=new Map();}
  close(){this.closed=true;clearTimeout(this.starsTimer);this.codex.close();this.store.close();}
  startStarsSync({interval=HOUR,schedule=setTimeout,fetcher=fetch}={}){
    if(this.starsAutomatic)return;
    this.starsAutomatic=true;
    const run=async()=>{try{await this.stars({fetcher});}catch(e){if(!this.closed)this.store.setSetting('starsSync',{...this.store.setting('starsSync',{}),error:e.message});}
      if(this.closed)return;
      const delay=Math.max(interval,(this.store.setting('githubRetryAt',0)||0)-Date.now());
      this.starsNextAt=new Date(Date.now()+delay).toISOString();this.starsTimer=schedule(run,delay);this.starsTimer?.unref?.();
    };
    this.starsTimer=schedule(run,0);this.starsTimer?.unref?.();
  }
  async conversations(currentId='',refresh=false){
    if(refresh||!this.directoryCache||Date.now()-this.directoryCache.at>30000){
      try{this.directoryCache={...(await this.codex.conversationDirectory()),at:Date.now(),verified:true,error:null};}
      catch(e){this.directoryCache={projects:[],threads:[],...this.directoryCache,at:Date.now(),verified:false,error:e.message};}
    }
    const known=this.store.conversations(),current=this.store.conversation(currentId);
    if(current&&!known.some(c=>c.id===current.id))known.unshift(current);
    return {...conversationDirectory(this.directoryCache,known,currentId),status:{verified:this.directoryCache.verified,error:this.directoryCache.error}};
  }
  async snapshot({conversationId='',refresh=false,runtime=true,days=30}={}){
    const directory=await this.conversations(conversationId,refresh),entry=directory.conversations.find(c=>c.id===conversationId);
    if(entry&&!this.store.conversation(conversationId))this.store.touchConversation({id:entry.id,cwd:entry.cwd,prompt:entry.prompt});
    const base=await this.catalog.scan(refresh),catalog={...base,skills:base.skills.map(s=>({...s}))},c=this.store.conversation(conversationId),cwd=c?.cwd||this.config.home;
    let runtimeStatus={verified:false,error:null};
    if(runtime){
      try{let cached=this.runtimeCache.get(cwd);if(refresh||!cached||Date.now()-cached.at>30000){cached={...(await this.codex.registered(cwd)),at:Date.now()};this.runtimeCache.set(cwd,cached);}runtimeStatus={verified:true,error:null,errors:cached.errors};for(const s of catalog.skills){const r=cached.data.get(s.realPath);s.registered=!!r;s.runtimeEnabled=r?.enabled??null;}}
      catch(e){runtimeStatus.error=e.message;}
    }
    const stats=this.store.stats(days),preferences=this.store.preferences(),evidence=this.store.conversationEvidence(conversationId);
    const skills=catalog.skills.map(s=>({...s,conversationState:{selected:!!c?.selection.includes(s.id),deliveredAt:evidence[s.id]?.deliveredAt||null,readAt:evidence[s.id]?.readAt||null},stats:{loaded:stats[s.id]?.loaded||0,selected:stats[s.id]?.selected||0,injected:stats[s.id]?.injected||0,delivered:stats[s.id]?.delivered||0},stars:s.repo?this.store.repo(s.repo):null}));
    return {...catalog,skills,categories,starsSync:{...this.store.setting('starsSync',{}),running:!!this.starsFlight,automatic:!!this.starsAutomatic,nextAt:this.starsNextAt||null,retryAt:this.store.setting('githubRetryAt',null)},conversation:c?{...c,...entry,prompt:userTask(c.prompt)}:null,conversations:directory.conversations,projects:directory.projects,conversationDirectoryStatus:directory.status,runtimeStatus,url:webUrl(conversationId,this.config),statistics:{since:this.store.setting('trackingSince'),days,coverage:'MCP 返回说明及 Hook 可确认的文件读取；不覆盖全部使用'},integration:{...this.store.setting('integration',{}),hookObserved:!!c?.lastHook},preferences};
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
    this.store.event({key:`delivered:${conversationId}:${turn}:${id}`,kind:'delivered',conversationId,turnId:turn,skillId:id,evidence:'MCP 已返回完整 SKILL.md'});
    this.store.event({key:`loaded:${conversationId}:${turn}:${id}`,kind:'loaded',conversationId,turnId:turn,skillId:id,evidence:'MCP 已返回完整 SKILL.md'});
    return {skill,text};
  }
  async preference(id,{category,repo}){
    await this.catalog.get(id);
    if(category!==undefined&&category!==null&&!categories.some(c=>c.id===category))throw new Error('未知分类');
    if(repo!==undefined&&repo!==null&&repo!==''&&!normalizeRepo(repo))throw new Error('请填写 GitHub 的 owner/repo 或仓库首页地址');
    this.store.preference(id,{category,repo:repo===undefined?undefined:normalizeRepo(repo)});await this.catalog.scan(true);
  }
  stars(options={}){
    if(this.starsFlight)return this.starsFlight;
    this.starsFlight=this.syncStars(options).finally(()=>{this.starsFlight=null;});return this.starsFlight;
  }
  async syncStars({force=false,fetcher=fetch,discover=true}={}){
    const retryAt=this.store.setting('githubRetryAt',0);
    if(retryAt>Date.now())throw new Error('GitHub 已限流，请在 '+new Date(retryAt).toLocaleString()+' 后重试');
    let {skills}=await this.catalog.scan(true);let sourceErrors=[];
    if(discover&&skills.some(s=>!s.repo)){sourceErrors=await refreshSources(this.store,fetcher,()=>!this.closed);if(this.closed)return;({skills}=await this.catalog.scan(true));}
    const repos=[...new Set(skills.map(s=>s.repo).filter(Boolean))];let updated=0;const errors=[];
    for(const repo of repos){if(this.closed)break;const cached=this.store.repo(repo);if(!force&&cached&&Date.now()-Date.parse(cached.checkedAt)<HOUR)continue;
      if(this.store.setting('githubRetryAt',0)>Date.now())break;
      try{const data=await githubJson('https://api.github.com/repos/'+repo,fetcher);if(!Number.isSafeInteger(data.stargazers_count)||data.stargazers_count<0)throw new Error('仓库热度响应无效');if(this.closed)break;this.store.saveRepo(repo,{stars:data.stargazers_count,status:'ok'});updated++;}
      catch(e){if(this.closed)break;this.store.saveRepo(repo,{status:'error',error:e.message});errors.push({repo,message:e.message});if(e.retryAt){this.store.setSetting('githubRetryAt',e.retryAt);break;}}
    }
    const result={repositories:repos.length,updated,failed:errors.length,unknown:skills.filter(s=>!s.repo).length,errors,sourceErrors};
    if(!this.closed)this.store.setSetting('starsSync',{...result,checkedAt:new Date().toISOString()});return result;
  }
}
