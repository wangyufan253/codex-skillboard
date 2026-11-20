// Codex prepends this host-generated block to the user's message. It is not task text.
export function userTask(text=''){
  if(typeof text!=='string')return '';
  const cleaned=text.replace(/<in-app-browser-context\b[^>]*>[\s\S]*?(?:<\/in-app-browser-context\s*>|$)/gi,'');
  return (cleaned!==text?cleaned.replace(/^\s*## My request:\s*/i,''):cleaned).trim();
}
