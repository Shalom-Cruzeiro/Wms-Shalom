/* Shalom WMS - servidor
 * - Autenticação por usuário/senha (JWT + bcrypt)
 * - Armazenamento: PostgreSQL se DATABASE_URL estiver setado; senão arquivo JSON local (dev)
 * - API de dados: key-value compartilhado por toda a organização (estoque é da empresa, não por usuário)
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json({ limit: '30mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-troque-em-producao';
const usesPg = !!process.env.DATABASE_URL;

/* ----------------- camada de armazenamento ----------------- */
let pool;
const jsonPath = path.join(__dirname, 'data', 'store.json');
let jsonData = { users: {}, kv: {} };

function saveJson() {
  try { fs.writeFileSync(jsonPath, JSON.stringify(jsonData)); }
  catch (e) { console.error('Erro salvando JSON:', e.message); }
}

async function initStore() {
  if (usesPg) {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await pool.query('CREATE TABLE IF NOT EXISTS users (username text PRIMARY KEY, hash text NOT NULL, created_at timestamptz DEFAULT now())');
    await pool.query('CREATE TABLE IF NOT EXISTS kv (key text PRIMARY KEY, value jsonb, updated_at timestamptz DEFAULT now())');
    console.log('Armazenamento: PostgreSQL');
  } else {
    try {
      fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
      jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    } catch (e) { jsonData = { users: {}, kv: {} }; saveJson(); }
    console.log('Armazenamento: arquivo JSON local (defina DATABASE_URL para usar PostgreSQL no Render)');
  }
}

async function getUserHash(u) {
  if (usesPg) { const r = await pool.query('SELECT hash FROM users WHERE username=$1', [u]); return r.rows[0] && r.rows[0].hash; }
  return jsonData.users[u];
}
async function setUser(u, hash) {
  if (usesPg) { await pool.query('INSERT INTO users(username,hash) VALUES($1,$2) ON CONFLICT(username) DO UPDATE SET hash=excluded.hash', [u, hash]); }
  else { jsonData.users[u] = hash; saveJson(); }
}
async function kvGet(k) {
  if (usesPg) { const r = await pool.query('SELECT value FROM kv WHERE key=$1', [k]); return r.rows[0] ? r.rows[0].value : null; }
  return (k in jsonData.kv) ? jsonData.kv[k] : null;
}
async function kvSet(k, v) {
  if (usesPg) { await pool.query('INSERT INTO kv(key,value,updated_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=now()', [k, JSON.stringify(v)]); }
  else { jsonData.kv[k] = v; saveJson(); }
}
async function kvDel(k) {
  if (usesPg) { await pool.query('DELETE FROM kv WHERE key=$1', [k]); }
  else { delete jsonData.kv[k]; saveJson(); }
}

/* ----------------- usuários iniciais ----------------- */
async function seedUsers() {
  const admin = process.env.ADMIN_USER || 'admin';
  const pass = process.env.ADMIN_PASS || 'shalom123';
  if (!(await getUserHash(admin))) {
    await setUser(admin, bcrypt.hashSync(pass, 10));
    console.log('Usuário admin criado:', admin);
  }
  // usuários extras via env USERS="fulano:senha1,ciclano:senha2"
  const extras = (process.env.USERS || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const pair of extras) {
    const i = pair.indexOf(':'); if (i < 0) continue;
    const u = pair.slice(0, i), p = pair.slice(i + 1);
    if (u && !(await getUserHash(u))) await setUser(u, bcrypt.hashSync(p, 10));
  }
}

/* ----------------- auth ----------------- */
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  try { req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch (e) { res.status(401).json({ error: 'não autorizado' }); }
}

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  const hash = await getUserHash((username || '').trim());
  if (!hash || !bcrypt.compareSync(password || '', hash)) {
    return res.status(401).json({ error: 'usuário ou senha inválidos' });
  }
  const token = jwt.sign({ username: (username || '').trim() }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, username: (username || '').trim() });
});

app.get('/api/me', auth, (req, res) => res.json({ username: req.user.username }));

app.get('/api/kv/:key', auth, async (req, res) => {
  const v = await kvGet(req.params.key);
  res.json({ key: req.params.key, value: v });
});
app.put('/api/kv/:key', auth, async (req, res) => {
  await kvSet(req.params.key, req.body && req.body.value);
  res.json({ ok: true });
});
app.delete('/api/kv/:key', auth, async (req, res) => {
  await kvDel(req.params.key);
  res.json({ ok: true });
});

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
initStore()
  .then(seedUsers)
  .then(() => app.listen(PORT, () => console.log('Shalom WMS rodando na porta ' + PORT)))
  .catch(e => { console.error('Falha ao iniciar:', e); process.exit(1); });
