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
    <form className="card auth" onSubmit={submit}>
      <h1>Shortly</h1>
      <p className="muted">Short links with expiry dates, click limits and QR codes.</p>
      <input type="email" required placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <input type="password" required placeholder="Password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      {err && <p className="err">{err}</p>}
      <button>{mode === 'login' ? 'Log in' : 'Create account'}</button>
      <button type="button" className="ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'New here? Create an account' : 'Have an account? Log in'}
      </button>
    </form>
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
    <form className="card" onSubmit={submit}>
      <input required placeholder="Paste a long URL" value={f.url} onChange={set('url')} />
      <div className="grid">
        <input placeholder="Custom alias (optional)" value={f.alias} onChange={set('alias')} />
        <input type="datetime-local" title="Expires at" value={f.expiresAt} onChange={set('expiresAt')} />
        <input type="number" min="1" placeholder="Max clicks" value={f.maxClicks} onChange={set('maxClicks')} />
        <button>Shorten</button>
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
      <header className="row"><h1>Shortly</h1><span>{email} <button className="ghost" onClick={onLogout}>Log out</button></span></header>
      <Create onCreated={load} />
      <div className="card scroll">
        {links.length === 0 ? <p className="muted">No links yet. Paste a URL above to create your first one.</p> : (
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
                    <button className="ghost" onClick={() => navigator.clipboard.writeText(l.short_url)}>Copy</button>
                    <button className="ghost" onClick={() => setModal({ type: 'qr', l })}>QR</button>
                    <button className="ghost" onClick={() => setModal({ type: 'stats', l })}>Stats</button>
                    <button className="ghost danger" onClick={() => del(l.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
