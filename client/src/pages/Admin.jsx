import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { WaveMark } from '../components/WaveMark';
import { SegmentedToggle } from '../components/SegmentedToggle';

const EVENT_LABEL = { login: 'Login', page_view: 'Page view', note_added: 'Note left' };

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function TopShows({ shows }) {
  if (!shows || shows.length === 0) return <span className="spec">—</span>;
  return (
    <div className="admin-top-shows">
      {shows.map((s) => (
        <span key={s.show_name} className="admin-show-chip">
          {s.show_name} <span className="mono-num">{s.views}</span>
        </span>
      ))}
    </div>
  );
}

function AdminLogin({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.adminLogin(password);
      onSuccess();
    } catch (err) {
      setError('Incorrect password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <WaveMark className="login-mark" />
        <h1 className="login-title">Admin</h1>
        <p className="spec login-subtitle">Activity dashboard</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
          autoFocus
        />
        {error && <p className="form-error spec">{error}</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  );
}

function ActivityPanel() {
  const [activity, setActivity] = useState(null);
  const [error, setError] = useState(null);

  function refresh() {
    api
      .getActivity()
      .then(setActivity)
      .catch(() => setError('Could not load activity.'));
  }

  useEffect(refresh, []);

  return (
    <>
      <div className="toolbar">
        <p className="spec" style={{ margin: 0 }}>
          Who&rsquo;s using the tool
        </p>
        <button className="icon-button" onClick={refresh}>
          Refresh
        </button>
      </div>

      {error && <p className="form-error spec">{error}</p>}
      {!error && !activity && <p className="empty-state spec">Loading…</p>}

      {activity && (
        <>
          <section className="show-section">
            <h2 className="detail-section-title">Leaderboard</h2>
            {activity.users.length === 0 ? (
              <p className="empty-state spec">No logins recorded yet.</p>
            ) : (
              <div className="episode-table-wrap">
                <table className="episode-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Shows viewed</th>
                      <th>Notes left</th>
                      <th>Page views</th>
                      <th>Logins</th>
                      <th>Last active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.users.map((u, i) => (
                      <tr key={u.user_name}>
                        <td className="mono-num">{i + 1}</td>
                        <td>{u.user_name}</td>
                        <td className="admin-shows-cell">
                          <TopShows shows={u.top_shows} />
                        </td>
                        <td className="mono-num">{u.note_count}</td>
                        <td className="mono-num">{u.page_view_count}</td>
                        <td className="mono-num">{u.login_count}</td>
                        <td className="mono-num">{formatDateTime(u.last_active)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="show-section">
            <h2 className="detail-section-title">Recent activity</h2>
            {activity.recent.length === 0 ? (
              <p className="empty-state spec">Nothing logged yet.</p>
            ) : (
              <div className="episode-table-wrap">
                <table className="episode-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Event</th>
                      <th>Show</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.recent.map((row, i) => (
                      <tr key={i}>
                        <td>{row.user_name}</td>
                        <td>{EVENT_LABEL[row.event_type] || row.event_type}</td>
                        <td>{row.show_name || '—'}</td>
                        <td className="mono-num">{formatDateTime(row.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

function PasswordCell({ password, onCopy, copied }) {
  return (
    <div className="admin-password-cell">
      <span className="admin-password-value">{password}</span>
      <button type="button" className="icon-button" onClick={onCopy}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}

function AccountsPanel() {
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  function refresh() {
    api
      .getAccounts()
      .then(setAccounts)
      .catch(() => setError('Could not load accounts.'));
  }

  useEffect(refresh, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api.createAccount(name.trim());
      setName('');
      refresh();
    } catch (err) {
      setError(err.message || 'Could not create account.');
    } finally {
      setCreating(false);
    }
  }

  async function handleReset(account) {
    setError(null);
    try {
      await api.resetAccountPassword(account.id);
      refresh();
    } catch (err) {
      setError(err.message || 'Could not reset password.');
    }
  }

  async function handleRemove(account) {
    if (!window.confirm(`Remove ${account.name}'s account? They'll fall back to the shared password.`)) return;
    setError(null);
    try {
      await api.deleteAccount(account.id);
      refresh();
    } catch (err) {
      setError(err.message || 'Could not remove account.');
    }
  }

  function copyPassword(account) {
    navigator.clipboard?.writeText(account.password).then(() => {
      setCopiedId(account.id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }

  return (
    <>
      <div className="toolbar">
        <p className="spec" style={{ margin: 0 }}>
          Create a login for someone new
        </p>
      </div>

      <div className="glass-panel account-create-form">
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 10, flex: 1, flexWrap: 'wrap' }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Their name"
          />
          <button type="submit" className="btn-primary" disabled={creating || !name.trim()}>
            {creating ? 'Creating…' : 'Create account'}
          </button>
        </form>
      </div>

      {error && <p className="form-error spec">{error}</p>}
      {!error && !accounts && <p className="empty-state spec">Loading…</p>}

      {accounts && (
        <section className="show-section">
          <h2 className="detail-section-title">Accounts</h2>
          {accounts.length === 0 ? (
            <p className="empty-state spec">No named accounts yet — everyone's using the shared password.</p>
          ) : (
            <div className="episode-table-wrap">
              <table className="episode-table admin-accounts-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Password</th>
                    <th>Created</th>
                    <th>Last login</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id}>
                      <td>{account.name}</td>
                      <td>
                        <PasswordCell
                          password={account.password}
                          copied={copiedId === account.id}
                          onCopy={() => copyPassword(account)}
                        />
                      </td>
                      <td className="mono-num">{formatDateTime(account.created_at)}</td>
                      <td className="mono-num">{formatDateTime(account.last_login_at)}</td>
                      <td>
                        <div className="admin-account-actions">
                          <button className="icon-button" onClick={() => handleReset(account)}>
                            Reset password
                          </button>
                          <button className="icon-button" onClick={() => handleRemove(account)}>
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function ActivityDashboard({ onLogout }) {
  const [tab, setTab] = useState('activity');

  async function handleLogout() {
    await api.adminLogout();
    onLogout();
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <WaveMark />
          <div className="app-title-block">
            <span className="app-title">Admin</span>
            <span className="app-subtitle">Wave Originals</span>
          </div>
        </div>
        <div className="app-header-actions">
          <SegmentedToggle
            options={[
              { value: 'activity', label: 'Activity' },
              { value: 'accounts', label: 'Accounts' },
            ]}
            value={tab}
            onChange={setTab}
          />
          <button className="icon-button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      {tab === 'activity' ? <ActivityPanel /> : <AccountsPanel />}
    </div>
  );
}

export function Admin() {
  const [checked, setChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    api
      .getAdminSession()
      .then((res) => setIsAdmin(res.isAdmin))
      .finally(() => setChecked(true));
  }, []);

  if (!checked) return null;
  if (!isAdmin) return <AdminLogin onSuccess={() => setIsAdmin(true)} />;

  return <ActivityDashboard onLogout={() => setIsAdmin(false)} />;
}
