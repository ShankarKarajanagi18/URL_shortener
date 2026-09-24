import { useState, useEffect, useCallback } from 'react';

const api = async (path, opts = {}) => {
  const token = localStorage.getItem('token');
  const res = await fetch('/api' + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
  });
  if (res.status === 401 && token) { localStorage.clear(); location.reload(); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
};

const status = (l) =>
  l.expires_at && new Date(l.expires_at) < new Date() ? 'Expired'
  : l.max_clicks && l.click_count >= l.max_clicks ? 'Limit reached' : 'Active';

function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}><span className="brand-mark">↗</span><span>Shortly</span></div>;
}

function FeatureList() {
  const features = [
    ['↗', 'Shorten URLs', 'Convert long links into clean, shareable URLs.'],
    ['⌘', 'Manage your links', 'Create, view and delete your links anytime.'],
    ['◷', 'Expiry & click limits', 'Set a date or maximum number of clicks.'],
    ['▦', 'Download QR codes', 'Share every short link as a QR code.'],
    ['▥', 'Track & analyze', 'Monitor clicks and understand performance.'],
  ];
  return <div className="feature-list">{features.map(([icon, title, copy]) => <div className="feature" key={title}><span className="feature-icon">{icon}</span><div><b>{title}</b><p>{copy}</p></div></div>)}</div>;
}

function Auth({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ email: '', password: '' });
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try {
      const d = await api(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(f) });
      localStorage.setItem('token', d.token); localStorage.setItem('email', d.email); onAuth(d.email);
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="auth-page">
      <div className="auth-brand"><Brand /><span>Already have an account? <button className="ghost" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create an account' : 'Log in'} →</button></span></div>
      <div className="auth-layout">
        <section className="auth-intro"><p className="eyebrow">Shorten. Share. Track.</p><h1>Turn long links into <em>short, powerful links.</em></h1><p className="intro-copy">Simple URL shortening with powerful features to help you share, manage and track your links, all in one place.</p><FeatureList /></section>
        <form className="card auth" onSubmit={submit}>
          <Brand compact /><p className="welcome">{mode === 'login' ? 'Welcome back!' : 'Create your account'}</p><p className="muted">{mode === 'login' ? 'Sign in to manage your links and track performance.' : 'Start creating and tracking your short links.'}</p>
          <label htmlFor="email">Email</label><input id="email" type="email" required placeholder="Enter your email address" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <label htmlFor="password">Password</label><input id="password" type="password" required placeholder="Enter your password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          {err && <p className="err">{err}</p>}
          <button className="primary-action">{mode === 'login' ? 'Log in  →' : 'Create account  →'}</button>
          <div className="or"><span>OR</span></div>
          <button type="button" className="switch-auth ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? '♙  New here? Create an account' : '←  Have an account? Log in'}</button>
        </form>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <div className="row"><h3>{title}</h3><button className="ghost" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

function Create({ onCreated }) {
  const empty = { url: '', alias: '', expiresAt: '', maxClicks: '' };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try {
      await api('/links', {
        method: 'POST',
        body: JSON.stringify({ ...f, expiresAt: f.expiresAt ? new Date(f.expiresAt).toISOString() : null, maxClicks: f.maxClicks || null }),
      });
      setF(empty); onCreated();
    } catch (e) { setErr(e.message); }
  };
  return (
    <form className="card create-card" onSubmit={submit}>
      <div className="section-heading"><span className="section-icon">↗</span><div><h2>Shortly</h2><p>Short links with expiry dates, click limits and QR codes.</p></div><span className="hero-link">↗</span></div>
      <input required aria-label="Long URL" placeholder="↗   Paste a long URL" value={f.url} onChange={set('url')} />
      <div className="grid">
        <input aria-label="Custom alias" placeholder="↗   Custom alias (optional)" value={f.alias} onChange={set('alias')} />
        <input aria-label="Expires at" type="datetime-local" title="Expires at" value={f.expiresAt} onChange={set('expiresAt')} />
        <input aria-label="Max clicks" type="number" min="1" placeholder="◷   Max clicks" value={f.maxClicks} onChange={set('maxClicks')} />
        <button className="primary-action">➤  Shorten</button>
      </div>
      {err && <p className="err">{err}</p>}
    </form>
  );
}

function Stats({ link }) {
  const [s, setS] = useState(null);
  useEffect(() => { api(`/links/${link.id}/stats`).then(setS).catch(() => {}); }, [link.id]);
  if (!s) return <p className="muted">Loading…</p>;
  const max = Math.max(1, ...s.byDay.map((d) => d.count));
  const List = ({ rows }) =>
    rows.length ? rows.map((r) => <div className="row" key={r.name}><span>{r.name}</span><b>{r.count}</b></div>) : <p className="muted">No clicks yet</p>;
  return (
    <>
      <p><b>{s.link.click_count}</b> total clicks</p>
      <h4>Last 30 days</h4>
      <div className="bars">
        {s.byDay.length
          ? s.byDay.map((d) => <div key={d.day} className="bar" title={`${d.day}: ${d.count}`} style={{ height: `${(d.count / max) * 100}%` }} />)
          : <p className="muted">No clicks yet</p>}
      </div>
      <h4>Top referrers</h4><List rows={s.referrers} />
      <h4>Devices</h4><List rows={s.devices} />
    </>
  );
}

function Dashboard({ email, onLogout }) {
  const [links, setLinks] = useState([]);
  const [modal, setModal] = useState(null);
  const load = useCallback(() => api('/links').then(setLinks).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const del = async (id) => {
    if (confirm('Delete this link? Its QR code will stop working too.')) { await api(`/links/${id}`, { method: 'DELETE' }); load(); }
  };
  return (
    <main>
      <header className="topbar"><Brand /><span className="account"><span>✉ &nbsp;{email}</span><button className="ghost" onClick={onLogout}>↪ &nbsp; Log out</button></span></header>
      <Create onCreated={load} />
      <div className="card links-card">
        <div className="section-heading compact-heading"><span className="section-icon">↗</span><div><h2>Your Links</h2><p>Manage, copy and track your shortened links.</p></div></div>
        {links.length === 0 ? <p className="empty-state">ⓘ &nbsp; No links yet. Paste a URL above to create your first one.</p> : (
          <div className="scroll">
          <table>
            <thead><tr><th>Short link</th><th>Original</th><th>Clicks</th><th>Status</th><th>Expires</th><th></th></tr></thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.id}>
                  <td><a href={l.short_url} target="_blank" rel="noreferrer">{l.short_url.replace(/^https?:\/\//, '')}</a></td>
                  <td className="orig" title={l.original_url}>{l.original_url}</td>
                  <td>{l.click_count}{l.max_clicks ? ` / ${l.max_clicks}` : ''}</td>
                  <td><span className={`pill ${status(l).replace(' ', '-').toLowerCase()}`}>{status(l)}</span></td>
                  <td>{l.expires_at ? new Date(l.expires_at).toLocaleString() : 'Never'}</td>
                  <td className="actions">
                    <button className="icon-action copy" title="Copy link" onClick={() => navigator.clipboard.writeText(l.short_url)}>▣<small>Copy</small></button>
                    <button className="icon-action qr-action" title="Show QR code" onClick={() => setModal({ type: 'qr', l })}>▦<small>QR</small></button>
                    <button className="icon-action stats-action" title="View stats" onClick={() => setModal({ type: 'stats', l })}>▥<small>Stats</small></button>
                    <button className="icon-action danger" title="Delete link" onClick={() => del(l.id)}>▥<small>Delete</small></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
      {modal?.type === 'qr' && (
        <Modal title={`QR code for /${modal.l.code}`} onClose={() => setModal(null)}>
          <img className="qr" src={`/api/qr/${modal.l.code}`} alt="QR code" />
          <a className="btn" href={`/api/qr/${modal.l.code}`} download={`${modal.l.code}-qr.png`}>Download PNG</a>
        </Modal>
      )}
      {modal?.type === 'stats' && (
        <Modal title={`Stats for /${modal.l.code}`} onClose={() => setModal(null)}><Stats link={modal.l} /></Modal>
      )}
    </main>
  );
}

export default function App() {
  const [email, setEmail] = useState(localStorage.getItem('token') ? localStorage.getItem('email') : null);
  return email
    ? <Dashboard email={email} onLogout={() => { localStorage.clear(); setEmail(null); }} />
    : <Auth onAuth={setEmail} />;
}
