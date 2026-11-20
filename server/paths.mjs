import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function paths(env = process.env) {
  const home = resolve(env.SKILL_WORKBENCH_USER_HOME || homedir());
  const codex = resolve(env.CODEX_HOME || resolve(home, '.codex'));
  return { home, codex, data: resolve(env.SKILL_WORKBENCH_HOME || resolve(projectRoot, '.local')), roots: [resolve(home, '.agents/skills'), resolve(codex, 'skills')], config: resolve(codex, 'config.toml'), port: Number(env.SKILL_WORKBENCH_PORT || 43821) };
}
export function webUrl(conversationId = '', config = paths()) {
  return `http://127.0.0.1:${config.port}/${conversationId ? '?conversation=' + encodeURIComponent(conversationId) : ''}`;
}
