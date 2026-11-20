import { basename, resolve, sep } from 'node:path';
import { userTask } from './recommend.mjs';

export function conversationDirectory(metadata,known,currentId=''){
  const projects=metadata.projects.map(p=>({id:p.id,name:p.name,roots:p.roots.map(r=>r.path)}));
  const local=new Map(known.map(c=>[c.id,c]));
  const threads=new Map(metadata.threads.map(t=>[t.id,t]));
  for(const c of known)if(!threads.has(c.id)&&(!metadata.verified||c.id===currentId))threads.set(c.id,c);
  const conversations=[];
  for(const t of threads.values()){
    if(!t.cwd)continue;
    const cwd=resolve(t.cwd);
    let project=projects.find(p=>p.id===t.projectId);
    const explicitProject=!!project;
    if(!project){
      const matches=projects.flatMap(p=>p.roots.filter(root=>cwd===resolve(root)||cwd.startsWith(resolve(root)+sep)).map(root=>({project:p,length:resolve(root).length})));
      project=matches.sort((a,b)=>b.length-a.length)[0]?.project;
    }
    if(!project){
      const id='directory:'+cwd;project=projects.find(p=>p.id===id);
      if(!project){project={id,name:(basename(cwd)||cwd)+'（未归属项目）',roots:[cwd]};projects.push(project);}
    }
    const c=local.get(t.id);
    conversations.push({id:t.id,cwd,title:t.name||'未命名对话',projectId:project.id,projectName:project.name,projectGrouping:explicitProject?'project':'directory',prompt:userTask(c?.prompt||t.preview||t.prompt||''),lastHook:c?.lastHook||null,lastSeen:c?.lastSeen||new Date((t.updatedAt||0)*1000).toISOString()});
  }
  for(const p of projects)p.conversationCount=conversations.filter(c=>c.projectId===p.id).length;
  return {projects,conversations};
}
