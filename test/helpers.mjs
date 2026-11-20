import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Workbench } from '../server/core.mjs';
export async function fixture(t){
  const home=await mkdtemp(join(tmpdir(),'skill-workbench-test-')),codex=join(home,'.codex'),shared=join(home,'.agents/skills'),personal=join(codex,'skills');
  await mkdir(shared,{recursive:true});await mkdir(personal,{recursive:true});await writeFile(join(codex,'config.toml'),'model = "test"\n');
  const config={home,codex,data:join(home,'data'),config:join(codex,'config.toml'),roots:[shared,personal],port:0};
  const app=new Workbench(config);app.codex.conversationDirectory=async()=>({projects:[],threads:app.store.conversations()});t.after(async()=>{app.close();await rm(home,{recursive:true,force:true});});
  async function skill(name,description,root=personal){const dir=join(root,name);await mkdir(dir,{recursive:true});const path=join(dir,'SKILL.md');await writeFile(path,`---\nname: ${name}\ndescription: >-\n  ${description}\n---\n\n# Workflow\n\nFollow the selected procedure.\n`);return path;}
  return {app,config,skill,home,shared,personal};
}
