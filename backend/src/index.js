require('express-async-errors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const UAParser = require('ua-parser-js');
const pool = require('./db');

const { JWT_SECRET = 'dev-secret', BASE_URL = 'http://localhost:8080', PORT = 4000 } = process.env;
const BASE_HOST = new URL(BASE_URL).host;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

const limit = (max) => rateLimit({ windowMs: 15 * 60 * 1000, max, standardHeaders: true, legacyHeaders: false });
const genCode = (n = 7) => Array.from(crypto.randomBytes(n), (b) => ALPHABET[b % 62]).join('');
const sign = (u) => jwt.sign({ id: u.id, email: u.email }, JWT_SECRET, { expiresIn: '7d' });
const fmt = (l) => ({ ...l, short_url: `${BASE_URL}/${l.code}` });
const page = (msg) => `<!doctype html><meta charset="utf-8"><title>${msg}</title><body style="font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0"><h2>${msg}</h2>`;
const auth = (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Please log in again' });
  }
};

app.get('/health', (_, res) => res.json({ ok: true }));

// ---- auth ----
app.post('/api/auth/register', limit(20), async (req, res) => {
  const { email = '', password = '' } = req.body;
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 6)
    return res.status(400).json({ error: 'Enter a valid email and a password of 6+ characters' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO users(email, password_hash) VALUES($1,$2) RETURNING id, email',
      [email.toLowerCase(), await bcrypt.hash(password, 10)]
    );
    res.status(201).json({ token: sign(rows[0]), email: rows[0].email });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That email is already registered' });
    throw e;
  }
});

app.post('/api/auth/login', limit(30), async (req, res) => {
  const { email = '', password = '' } = req.body;
  const { rows: [u] } = await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()]);
  if (!u || !(await bcrypt.compare(password, u.password_hash)))
    return res.status(401).json({ error: 'Wrong email or password' });
  res.json({ token: sign(u), email: u.email });
});

// ---- links ----
app.post('/api/links', auth, limit(60), async (req, res) => {
  const { url, alias, expiresAt, maxClicks } = req.body;
  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'Enter a valid URL, including https://' }); }
  if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).json({ error: 'Only http and https links are allowed' });
  if (parsed.host === BASE_HOST) return res.status(400).json({ error: "Can't shorten a link to this service" });
  if (alias && (!/^[A-Za-z0-9_-]{3,32}$/.test(alias) || alias.toLowerCase() === 'api'))
    return res.status(400).json({ error: 'Alias must be 3-32 letters, numbers, - or _' });

  let exp = null;
  if (expiresAt) {
    exp = new Date(expiresAt);
    if (isNaN(exp) || exp <= new Date()) return res.status(400).json({ error: 'Expiry must be a future date' });
  }
  let max = null;
  if (maxClicks !== null && maxClicks !== undefined && maxClicks !== '') {
    max = parseInt(maxClicks, 10);
    if (!(max > 0)) return res.status(400).json({ error: 'Max clicks must be 1 or more' });
  }

  for (let i = 0; i < 5; i++) {
    try {
      const { rows } = await pool.query(
        'INSERT INTO links(code, original_url, user_id, expires_at, max_clicks) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [alias || genCode(), parsed.href, req.user.id, exp, max]
      );
      return res.status(201).json(fmt(rows[0]));
    } catch (e) {
      if (e.code !== '23505') throw e;
      if (alias) return res.status(409).json({ error: 'That alias is already taken' });
    }
  }
  res.status(500).json({ error: 'Could not generate a code, try again' });
});

app.get('/api/links', auth, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM links WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id]);
  res.json(rows.map(fmt));
});

app.delete('/api/links/:id', auth, async (req, res) => {
  await pool.query('DELETE FROM links WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.status(204).end();
});

app.get('/api/links/:id/stats', auth, async (req, res) => {
  const { rows: [link] } = await pool.query('SELECT * FROM links WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  if (!link) return res.status(404).json({ error: 'Link not found' });
  const q = (sql) => pool.query(sql, [link.id]).then((r) => r.rows);
  const [byDay, referrers, devices] = await Promise.all([
    q(`SELECT to_char(date_trunc('day', clicked_at),'YYYY-MM-DD') AS day, COUNT(*)::int AS count
       FROM clicks WHERE link_id=$1 AND clicked_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`),
    q(`SELECT COALESCE(referrer,'Direct') AS name, COUNT(*)::int AS count
       FROM clicks WHERE link_id=$1 GROUP BY 1 ORDER BY 2 DESC LIMIT 5`),
    q(`SELECT device AS name, COUNT(*)::int AS count FROM clicks WHERE link_id=$1 GROUP BY 1 ORDER BY 2 DESC`),
  ]);
  res.json({ link: fmt(link), byDay, referrers, devices });
});

// ---- QR code (public: it only encodes the public short URL) ----
app.get('/api/qr/:code', async (req, res) => {
  const { rows } = await pool.query('SELECT 1 FROM links WHERE code=$1', [req.params.code]);
  if (!rows.length) return res.status(404).end();
  const target = `${BASE_URL}/${req.params.code}`;
  if (req.query.format === 'svg') return res.type('svg').send(await QRCode.toString(target, { type: 'svg', margin: 1 }));
  res.type('png').send(await QRCode.toBuffer(target, { width: 400, margin: 2 }));
});

// ---- redirect: atomic expiry + click-limit check, 302 so every click hits the server ----
app.get('/:code([A-Za-z0-9_-]{3,32})', async (req, res) => {
  const { rows: [link] } = await pool.query(
    `UPDATE links SET click_count = click_count + 1
     WHERE code=$1 AND (expires_at IS NULL OR expires_at > now()) AND (max_clicks IS NULL OR click_count < max_clicks)
     RETURNING id, original_url`,
    [req.params.code]
  );
  if (!link) {
    const { rows } = await pool.query('SELECT 1 FROM links WHERE code=$1', [req.params.code]);
    return res.status(rows.length ? 410 : 404).send(page(rows.length ? 'This link has expired' : 'Link not found'));
  }
  res.redirect(302, link.original_url);

  // log the click after responding so the redirect stays fast
  const ua = new UAParser(req.headers['user-agent']).getResult();
  let ref = null;
  try { ref = req.get('referer') ? new URL(req.get('referer')).hostname : null; } catch {}
  pool.query('INSERT INTO clicks(link_id, referrer, browser, device) VALUES($1,$2,$3,$4)',
    [link.id, ref, ua.browser.name || 'Unknown', ua.device.type || 'desktop']).catch(console.error);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
});

(async () => {
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  app.listen(PORT, () => console.log(`API on :${PORT}`));
})();
