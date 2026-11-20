const stop=new Set('a an the and or to of for in on with as is are be it this that when use using skill skills need want can you your'.split(' '));
// Codex prepends this host-generated block to the user's message. It is not task text.
export function userTask(text=''){
  if(typeof text!=='string')return '';
  const cleaned=text.replace(/<in-app-browser-context\b[^>]*>[\s\S]*?(?:<\/in-app-browser-context\s*>|$)/gi,'');
  return (cleaned!==text?cleaned.replace(/^\s*## My request:\s*/i,''):cleaned).trim();
}
const domains=[
  {category:'design',terms:/界面|卡片|排版|配色|视觉|可视化|美观|原型|ui\b|ux\b|frontend|design|landing page/i,aliases:['design','interface','layout','visual','frontend','ui']},
  {category:'development',terms:/开发|代码|编程|报错|调试|接口|后端|部署|bug\b|code\b|debug|backend|api\b/i,aliases:['code','software','debug','developer','api','deployment']},
  {category:'research',terms:/论文|科研|文献|实验|训练|模型|研究|paper\b|research|training|model/i,aliases:['research','paper','training','model','scientific']},
  {category:'documents',terms:/文档|幻灯片|演示文稿|表格|pdf\b|word\b|ppt\b|excel|spreadsheet|docx/i,aliases:['document','pdf','word','presentation','spreadsheet']}
];
function tokens(text){const words=(text.toLowerCase().match(/[a-z0-9]+/g)||[]).filter(w=>w.length>1&&!stop.has(w));for(const part of text.match(/[\u3400-\u9fff]+/g)||[])for(let i=0;i<part.length-1;i++)words.push(part.slice(i,i+2));return [...new Set(words)];}
export function recommend(skills,task,limit=6){
  task=userTask(task);
  if(!task)return [];
  const wanted=domains.filter(d=>d.terms.test(task));
  const original=tokens(task),expanded=[...new Set([...original,...wanted.flatMap(d=>d.aliases)])];
  const docs=skills.map(s=>(s.name+' '+s.description).toLowerCase());
  const df=new Map(expanded.map(t=>[t,docs.filter(d=>d.includes(t)).length]));
  return skills.map((s,index)=>{
    let score=0;const matched=[];
    for(const token of expanded)if(docs[index].includes(token)){const idf=Math.log(1+skills.length/(1+df.get(token)));score+=idf*(s.name.toLowerCase().includes(token)?3:1)*(original.includes(token)?1.5:.55);if(original.includes(token))matched.push(token);}
    const domain=wanted.find(d=>d.category===s.category);if(domain)score+=7;
    if(task.toLowerCase().includes(s.name.toLowerCase()))score+=35;
    if(!matched.length&&!domain)score=0;
    const label={design:'界面与视觉设计',development:'开发与调试',research:'科研与模型任务',documents:'文档与表格处理'}[s.category];
    return {id:s.id,score:Math.round(score*100)/100,reason:matched.length?'匹配：'+matched.slice(0,3).join('、'):'用途匹配：'+label};
  }).filter(r=>r.score>=4).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,limit).map((r,i)=>({...r,rank:i+1}));
}
