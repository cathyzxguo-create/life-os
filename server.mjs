// 生活 OS · 后端
// 零依赖：Node 22.5+ 自带的 node:sqlite。数据都在 DATA_DIR 里（一个 SQLite 文件 + 图片文件夹）。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PASSWORD = process.env.APP_PASSWORD || '';
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const API_URL = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com';
const SECURE_COOKIE = process.env.COOKIE_SECURE === '1';

if (!PASSWORD || PASSWORD.length < 8) { console.error('请设置 APP_PASSWORD（至少 8 位），例如：APP_PASSWORD=你的密码 node server.mjs'); process.exit(1); }
fs.mkdirSync(path.join(DATA_DIR, 'blobs'), { recursive: true });

/* ---------- 数据库 ---------- */
const db = new DatabaseSync(path.join(DATA_DIR, 'life-os.db'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, data TEXT, seq INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS docs_seq ON docs(seq);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS blobs (id TEXT PRIMARY KEY, type TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL);`);
const getMeta = k => db.prepare('SELECT v FROM meta WHERE k=?').get(k)?.v;
const setMeta = (k, v) => db.prepare('INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, String(v));
let SEQ = Number(getMeta('seq') || 0);
let SECRET = getMeta('secret'); if (!SECRET) { SECRET = crypto.randomBytes(32).toString('hex'); setMeta('secret', SECRET); }
const qAll = db.prepare('SELECT path, data FROM docs WHERE deleted=0');
const qSince = db.prepare('SELECT path, data, seq, deleted FROM docs WHERE seq>? ORDER BY seq LIMIT 2000');
const qPut = db.prepare('INSERT INTO docs(path,data,seq,deleted,updated_at) VALUES(?,?,?,0,?) ON CONFLICT(path) DO UPDATE SET data=excluded.data, seq=excluded.seq, deleted=0, updated_at=excluded.updated_at');
const qDel = db.prepare('UPDATE docs SET data=NULL, deleted=1, seq=?, updated_at=? WHERE path=?');
function nextSeq() { SEQ += 1; setMeta('seq', SEQ); return SEQ; }

/* ---------- 工具 ---------- */
const PATH_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}(\/[A-Za-z0-9_\-.~:@+]{1,200}){1,15}$/;
const okDocPath = p => typeof p === 'string' && p.length <= 1000 && PATH_RE.test(p) && p.split('/').length % 2 === 0 && !p.split('/').some(s => s === '.' || s === '..');
const BLOB_RE = /^[a-f0-9]{32}$/;
const IMG_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const send = (res, code, body, headers = {}) => {
  const isBuf = Buffer.isBuffer(body);
  const data = isBuf ? body : body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, { 'content-type': isBuf ? 'application/octet-stream' : typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
  res.end(data);
};
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
function makeToken() { const exp = Date.now() + 365 * 864e5; const v = `u.${exp}`; return `${v}.${sign(v)}`; }
function authed(req) {
  const m = /(?:^|;\s*)los=([^;]+)/.exec(req.headers.cookie || ''); if (!m) return false;
  const parts = m[1].split('.'); if (parts.length !== 3) return false;
  const v = `${parts[0]}.${parts[1]}`; const sig = Buffer.from(parts[2]); const good = Buffer.from(sign(v));
  return sig.length === good.length && crypto.timingSafeEqual(sig, good) && Number(parts[1]) > Date.now();
}
const cookie = (token, maxAge) => `los=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SECURE_COOKIE ? '; Secure' : ''}`;
const fails = new Map();
function loginAllowed(ip) { const f = fails.get(ip); return !f || f.n < 5 || Date.now() - f.t > 15 * 60e3; }
function loginFailed(ip) { const f = fails.get(ip) || { n: 0, t: 0 }; if (Date.now() - f.t > 15 * 60e3) f.n = 0; f.n += 1; f.t = Date.now(); fails.set(ip, f); }
function pwOk(p) { const a = crypto.createHash('sha256').update(String(p)).digest(); const b = crypto.createHash('sha256').update(PASSWORD).digest(); return crypto.timingSafeEqual(a, b); }

const INDEX = () => fs.readFileSync(path.join(ROOT, 'public', 'index.html'));
const MANIFEST = { name: 'Mimi 生活 OS', short_name: '生活 OS', start_url: '/', display: 'standalone', background_color: '#191919', theme_color: '#c4507b', icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }] };
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#c4507b"/><text x="50" y="68" font-size="58" text-anchor="middle" font-family="Georgia,serif" font-style="italic" fill="#fff">M</text></svg>`;

/* ---------- 路由 ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const p = url.pathname; const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return send(res, 200, INDEX(), { 'content-type': 'text/html; charset=utf-8' });
    if (req.method === 'GET' && p === '/manifest.webmanifest') return send(res, 200, JSON.stringify(MANIFEST), { 'content-type': 'application/manifest+json' });
    if (req.method === 'GET' && p === '/icon.svg') return send(res, 200, ICON, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' });
    if (p === '/healthz') return send(res, 200, 'ok');

    if (req.method === 'POST' && p === '/api/login') {
      if (!loginAllowed(ip)) return send(res, 429, { error: 'too_many' });
      let body = {}; try { body = JSON.parse((await readBody(req, 4096)).toString() || '{}'); } catch (e) {}
      if (!pwOk(body.password || '')) { loginFailed(ip); return send(res, 401, { error: 'wrong_password' }); }
      fails.delete(ip);
      return send(res, 200, { ok: true }, { 'set-cookie': cookie(makeToken(), 365 * 86400) });
    }
    if (req.method === 'POST' && p === '/api/logout') return send(res, 200, { ok: true }, { 'set-cookie': cookie('x', 0) });
    if (!p.startsWith('/api/')) return send(res, 404, 'not found');
    if (!authed(req)) return send(res, 401, { error: 'login' });

    if (req.method === 'GET' && p === '/api/me') return send(res, 200, { ok: true, ai: !!API_KEY });

    if (req.method === 'GET' && p === '/api/docs') {
      const docs = qAll.all().map(r => ({ path: r.path, data: JSON.parse(r.data) }));
      return send(res, 200, { seq: SEQ, docs });
    }
    if (req.method === 'GET' && p === '/api/changes') {
      const since = Number(url.searchParams.get('since') || 0);
      const rows = qSince.all(since).map(r => ({ path: r.path, seq: r.seq, data: r.deleted ? null : JSON.parse(r.data) }));
      return send(res, 200, { seq: rows.length ? rows[rows.length - 1].seq : since, more: rows.length === 2000, changes: rows });
    }
    if (p === '/api/doc' && (req.method === 'PUT' || req.method === 'DELETE')) {
      const dp = url.searchParams.get('path'); if (!okDocPath(dp)) return send(res, 400, { error: 'bad_path' });
      const now = Date.now();
      if (req.method === 'DELETE') { const s = nextSeq(); qDel.run(s, now, dp); return send(res, 200, { seq: s }); }
      const raw = await readBody(req, 300 * 1024); let data;
      try { data = JSON.parse(raw.toString()); } catch (e) { return send(res, 400, { error: 'bad_json' }); }
      if (!data || typeof data !== 'object' || Array.isArray(data)) return send(res, 400, { error: 'not_object' });
      const s = nextSeq(); qPut.run(dp, JSON.stringify(data), s, now); return send(res, 200, { seq: s });
    }

    if (req.method === 'POST' && p === '/api/blobs') {
      const type = String(req.headers['content-type'] || '').split(';')[0].trim();
      if (!IMG_TYPES.has(type)) return send(res, 415, { error: 'unsupported_type' });
      const buf = await readBody(req, 20 * 1024 * 1024); if (!buf.length) return send(res, 400, { error: 'empty' });
      const id = crypto.randomBytes(16).toString('hex');
      fs.writeFileSync(path.join(DATA_DIR, 'blobs', id), buf);
      db.prepare('INSERT INTO blobs(id,type,size,created_at) VALUES(?,?,?,?)').run(id, type, buf.length, Date.now());
      return send(res, 200, { id, url: '/api/blobs/' + id, sizeBytes: buf.length, contentType: type });
    }
    let m;
    if ((m = /^\/api\/blobs\/([a-f0-9]{32})$/.exec(p))) {
      const id = m[1]; const row = db.prepare('SELECT type FROM blobs WHERE id=?').get(id); const file = path.join(DATA_DIR, 'blobs', id);
      if (req.method === 'DELETE') { db.prepare('DELETE FROM blobs WHERE id=?').run(id); fs.rmSync(file, { force: true }); return send(res, 200, { deleted: !!row }); }
      if (req.method === 'GET') { if (!row || !fs.existsSync(file)) return send(res, 404, 'not found'); return send(res, 200, fs.readFileSync(file), { 'content-type': row.type, 'cache-control': 'private, max-age=31536000, immutable' }); }
    }

    if (req.method === 'POST' && p === '/api/ai') {
      if (!API_KEY) return send(res, 503, { error: 'no_server_key' });
      const raw = await readBody(req, 12 * 1024 * 1024);
      let body; try { body = JSON.parse(raw.toString()); } catch (e) { return send(res, 400, { error: 'bad_json' }); }
      const ac = new AbortController(); req.on('close', () => { if (!res.writableEnded) ac.abort(); });
      const up = await fetch(API_URL.replace(/\/$/, '') + '/v1/messages', { method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
      const text = await up.text();
      return send(res, up.status, text, { 'content-type': 'application/json; charset=utf-8' });
    }
    return send(res, 404, { error: 'not_found' });
  } catch (e) {
    if (e?.name === 'AbortError') return;
    console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status === 413 ? 'too_large' : 'server_error' });
  }
});
server.listen(PORT, () => console.log(`生活 OS 已启动：http://localhost:${PORT}  数据目录：${DATA_DIR}  AI：${API_KEY ? '已配置' : '未配置 ANTHROPIC_API_KEY'}`));
