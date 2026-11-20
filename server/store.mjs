import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
export class Store {
  constructor(directory) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(directory, 'workbench.sqlite'));
    chmodSync(join(directory, 'workbench.sqlite'), 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,cwd TEXT NOT NULL,prompt TEXT NOT NULL DEFAULT '',selection TEXT NOT NULL DEFAULT '[]',selectionVersion INTEGER NOT NULL DEFAULT 0,turnId TEXT,lastSeen TEXT NOT NULL,lastHook TEXT,injectedVersion INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS events(eventKey TEXT PRIMARY KEY,kind TEXT NOT NULL,conversationId TEXT,turnId TEXT,skillId TEXT,at TEXT NOT NULL,evidence TEXT);
      CREATE INDEX IF NOT EXISTS events_stats ON events(kind,skillId,at);
      CREATE TABLE IF NOT EXISTS preferences(skillId TEXT PRIMARY KEY,category TEXT,repo TEXT);
      CREATE TABLE IF NOT EXISTS repos(repo TEXT PRIMARY KEY,stars INTEGER,checkedAt TEXT,status TEXT,error TEXT);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  }
  close() { this.db.close(); }
  setting(key, fallback = null) { const r = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key); return r ? JSON.parse(r.value) : fallback; }
  setSetting(key, value) { this.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
  conversation(id) { const r = this.db.prepare('SELECT * FROM conversations WHERE id=?').get(id); return r ? { ...r, selection: JSON.parse(r.selection) } : null; }
  touchConversation({ id, cwd, prompt = '', turnId = null, fromHook = false }) {
    if (typeof id !== 'string' || !id || id.length > 200) throw new Error('缺少有效的对话 ID');
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO conversations(id,cwd,prompt,turnId,lastSeen,lastHook) VALUES(?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET cwd=excluded.cwd,prompt=CASE WHEN excluded.prompt='' THEN conversations.prompt ELSE excluded.prompt END,turnId=COALESCE(excluded.turnId,conversations.turnId),lastSeen=excluded.lastSeen,lastHook=COALESCE(excluded.lastHook,conversations.lastHook)`).run(id, cwd, prompt.slice(0,6000), turnId, now, fromHook ? now : null);
    return this.conversation(id);
  }
  conversations() { return this.db.prepare('SELECT id,cwd,prompt,lastSeen,lastHook,selectionVersion,injectedVersion FROM conversations ORDER BY lastSeen DESC LIMIT 60').all(); }
  saveSelection(id, skillIds) {
    const ids = [...new Set(skillIds)].sort();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const c = this.conversation(id); if (!c) throw new Error('请先绑定一个已知的 Codex 对话');
      if (JSON.stringify([...c.selection].sort()) === JSON.stringify(ids)) { this.db.exec('COMMIT'); return c; }
      const version = c.selectionVersion + 1;
      this.db.prepare('UPDATE conversations SET selection=?,selectionVersion=? WHERE id=?').run(JSON.stringify(ids), version, id);
      for (const skillId of ids) if (!c.selection.includes(skillId)) this.event({ key: `selected:${id}:${version}:${skillId}`, kind: 'selected', conversationId: id, skillId, evidence: '用户保存对话选择' });
      this.db.exec('COMMIT'); return this.conversation(id);
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  injected(id, version) { this.db.prepare('UPDATE conversations SET injectedVersion=? WHERE id=?').run(version, id); }
  event({ key, kind, conversationId = null, turnId = null, skillId = null, evidence = '' }) {
    return this.db.prepare('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?,?)').run(key, kind, conversationId, turnId, skillId, new Date().toISOString(), evidence).changes;
  }
  stats(days = 30) {
    const since = days ? new Date(Date.now() - days * 86400000).toISOString() : '';
    const rows = this.db.prepare('SELECT skillId,kind,count(*) AS total FROM events WHERE at>=? AND skillId IS NOT NULL GROUP BY skillId,kind').all(since);
    const data = {}; for (const r of rows) (data[r.skillId] ||= {})[r.kind] = Number(r.total); return data;
  }
  conversationEvidence(id) {
    if(!id)return {};
    const rows=this.db.prepare(`SELECT skillId,
      MAX(CASE WHEN kind='injected' OR (kind='loaded' AND evidence='MCP 已返回完整 SKILL.md') THEN at END) AS deliveredAt,
      MAX(CASE WHEN kind='loaded' THEN at END) AS readAt
      FROM events WHERE conversationId=? AND skillId IS NOT NULL AND kind IN ('injected','loaded') GROUP BY skillId`).all(id);
    return Object.fromEntries(rows.map(r=>[r.skillId,{deliveredAt:r.deliveredAt,readAt:r.readAt}]));
  }
  preferences() { return Object.fromEntries(this.db.prepare('SELECT * FROM preferences').all().map(r => [r.skillId, r])); }
  preference(id, changes) {
    const old = this.preferences()[id] || {};
    this.db.prepare('INSERT INTO preferences VALUES(?,?,?) ON CONFLICT(skillId) DO UPDATE SET category=excluded.category,repo=excluded.repo').run(id, changes.category === undefined ? old.category || null : changes.category, changes.repo === undefined ? old.repo || null : changes.repo);
  }
  repo(repo) { return this.db.prepare('SELECT * FROM repos WHERE repo=?').get(repo) || null; }
  saveRepo(repo, data) { const old = this.repo(repo); this.db.prepare('INSERT INTO repos VALUES(?,?,?,?,?) ON CONFLICT(repo) DO UPDATE SET stars=excluded.stars,checkedAt=excluded.checkedAt,status=excluded.status,error=excluded.error').run(repo, data.stars ?? old?.stars ?? null, new Date().toISOString(), data.status, data.error || null); }
}
