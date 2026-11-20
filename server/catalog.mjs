import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { resolve, join, basename, dirname, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { parse as parseToml } from 'smol-toml';
import { sourceMatch } from './sources.mjs';
export const categories = [{ id:'design',label:'设计' },{ id:'development',label:'开发' },{ id:'research',label:'研究' },{ id:'documents',label:'文档' },{ id:'other',label:'其他' }];
export const hash = text => createHash('sha256').update(text).digest('hex');
export const safeRead = async file => { try { return await readFile(file,'utf8'); } catch(e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return ''; throw e; } };
export function classify(name, description = '') {
  const n = name.toLowerCase(), all = (name+' '+description).toLowerCase();
  if (/frontend-design|impeccable|design-taste|hallmark|frontend-slides/.test(n)) return 'design';
  if (/ppt|powerpoint|paper2word|pdf|documents|spreadsheets|presentations/.test(n)) return 'documents';
  if (/^(nature-|academic-|ara-)|paper|autoresearch/.test(n)) return 'research';
  if (/find-skills|grill|backend-interview|dspy|autogpt|crewai|langchain|llamaindex|chroma|faiss|pinecone|qdrant|vllm|sglang|llama-cpp|modal|skypilot|lambda-labs|mlflow|tensorboard|weights-and-biases|swanlab|phoenix|langsmith|guardrail|prompt-guard|guidance|outlines|instructor|sentence-transformers|sentencepiece|huggingface-tokenizers/.test(n)) return 'development';
  if (/train|model|quantiz|llm|pytorch|attention|tokeniz|deepspeed|axolotl|peft|unsloth|mamba|rwkv|nanogpt|whisper|clip|blip|llava|diffusion|fsdp|megatron|trl|accelerate|eval|nnsight|pyvene|saelens|openpi|openvla|cosmos|nemo|ray/.test(all)) return 'research';
  if (/code|programming|software|developer|deployment/.test(all)) return 'development';
  return 'other';
}
export function parseSkill(text) {
  const match = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('缺少 YAML 元数据');
  const meta = parseYaml(match[1], { maxAliasCount: 30, schema:'core' });
  if (!meta || typeof meta.name !== 'string' || !meta.name.trim() || typeof meta.description !== 'string' || !meta.description.trim()) throw new Error('name 与 description 必须是非空文本');
  return meta;
}
export function normalizeRepo(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let text = value.trim().replace(/^git@github\.com:/i, 'https://github.com/').replace(/\.git\/?$/, '');
  if (/^[\w.-]+\/[\w.-]+$/.test(text)) text = 'https://github.com/' + text;
  try { const u = new URL(text); const parts = u.pathname.split('/').filter(Boolean); if (u.hostname !== 'github.com' || u.username || u.password || parts.length !== 2 || !parts.every(x=>/^[\w.-]+$/.test(x)) || u.search || u.hash) return null; return parts.join('/').toLowerCase(); } catch { return null; }
}
export function globalEnabled(config, skill) {
  let enabled = true;
  for (const entry of config.skills?.config || []) if ((entry.path && resolve(entry.path) === resolve(skill.path)) || (entry.path && resolve(entry.path) === skill.realPath) || (!entry.path && entry.name === skill.name)) if (typeof entry.enabled === 'boolean') enabled = entry.enabled;
  return enabled;
}
export async function readConfig(file) { const text = await safeRead(file); return text ? parseToml(text) : {}; }
export class Catalog {
  constructor(config, store) { this.config=config; this.store=store; this.cache=null; this.at=0; }
  async scan(force=false) {
    if (!force && this.cache && Date.now()-this.at<1500) return this.cache;
    const errors=[], skills=[], seen=new Set();
    let config={}; try {config=await readConfig(this.config.config);} catch(e){errors.push({path:this.config.config,message:'无法解析 Codex 配置：'+e.message});}
    let lock={}; try{lock=JSON.parse(await safeRead(join(this.config.home,'.agents/.skill-lock.json'))||'{}').skills||{};}catch{errors.push({path:'.agents/.skill-lock.json',message:'安装来源记录无法解析'});}
    const roots=[...this.config.roots,...this.store.setting('extraRoots',[])];
    const preferences=this.store.preferences();
    for (const root of [...new Set(roots.map(p=>resolve(p)))]) {
      let entries; try{entries=await readdir(root,{withFileTypes:true});}catch(e){if(e.code!=='ENOENT')errors.push({path:root,message:e.message});continue;}
      for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
        if(entry.name.startsWith('.')||(!entry.isDirectory()&&!entry.isSymbolicLink()))continue;
        const path=join(root,entry.name,'SKILL.md');
        try {
          const info=await stat(path);if(info.size>1024*1024)throw new Error('SKILL.md 超过 1 MB');
          const rp=await realpath(path);if(seen.has(rp))continue;
          const text=await readFile(path,'utf8'),meta=parseSkill(text);seen.add(rp);
          const id=hash(rp).slice(0,24), pref=preferences[id]||{};
          let repo=pref.repo || null, repoEvidence=repo?'用户指定':null;
          if(!repo&&root===this.config.roots[0]){repo=normalizeRepo(lock[entry.name]?.sourceUrl||lock[entry.name]?.source);if(repo)repoEvidence='安装记录';}
          if(!repo){const candidate=normalizeRepo(meta.metadata?.source||meta.metadata?.repository||meta.metadata?.official_repository||meta.repository);if(candidate){repo=candidate;repoEvidence='Skill 元数据';}}
          if(!repo){const gitConfig=await safeRead(join(dirname(path),'.git/config'));const remote=gitConfig.match(/\[remote "origin"\][\s\S]*?\burl\s*=\s*([^\r\n]+)/)?.[1];repo=normalizeRepo(remote);if(repo)repoEvidence='Git origin';}
          if(!repo){const match=sourceMatch(text,this.store);if(match){repo=match.repo;repoEvidence='公开仓库文件哈希一致：'+match.path;}}
          const category=categories.some(c=>c.id===pref.category)?pref.category:classify(meta.name,meta.description);
          const skill={id,name:meta.name.trim(),description:meta.description.trim(),path,realPath:rp,root,directory:root===this.config.roots[0]?'共享目录':root===this.config.roots[1]?'个人目录':'自定义目录',category,categoryInferred:!pref.category,repo,repoEvidence,modifiedAt:info.mtime.toISOString(),registered:null,runtimeEnabled:null};
          skill.globalEnabled=globalEnabled(config,skill);skills.push(skill);
        }catch(e){if(e.code!=='ENOENT'&&e.code!=='ENOTDIR')errors.push({path,message:e.message});}
      }
    }
    this.at=Date.now();return this.cache={skills,errors,roots,scannedAt:new Date().toISOString()};
  }
  async get(id) {const {skills}=await this.scan();const s=skills.find(s=>s.id===id);if(!s)throw new Error('Skill 不存在或已不在扫描目录中');if(await realpath(s.path)!==s.realPath)throw new Error('Skill 路径已变化，请刷新目录');return s;}
  async content(id) {const s=await this.get(id);const info=await stat(s.path);if(info.size>1024*1024)throw new Error('Skill 文件过大');return {skill:s,text:await readFile(s.path,'utf8')};}
}
