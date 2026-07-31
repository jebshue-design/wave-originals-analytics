import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { WaveMark } from '../components/WaveMark';

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

function ActivityDashboard({ onLogout }) {
  const [activity, setActivity] = useState(null);
  const [error, setError] = useState(null);

  function refresh() {
    api
      .getActivity()
      .then(setActivity)
      .catch(() => setError('Could not load activity.'));
  }

  useEffect(refresh, []);

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
            <span className="app-title">Activity</span>
            <span className="app-subtitle">Wave Originals Admin</span>
          </div>
        </div>
        <div className="app-header-actions">
          <button className="icon-button" onClick={refresh}>
            Refresh
          </button>
          <button className="icon-button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      {error && <p className="form-error spec">{error}</p>}

      {!error && !activity && <p className="empty-state spec">Loading…</p>}

      {activity && (
        <>
          <section className="show-section">
            <h2 className="detail-section-title">Users</h2>
            {activity.users.length === 0 ? (
              <p className="empty-state spec">No logins recorded yet.</p>
            ) : (
              <div className="episode-table-wrap">
                <table className="episode-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Last active</th>
                      <th>First login</th>
                      <th>Logins</th>
                      <th>Page views</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.users.map((u) => (
                      <tr key={u.user_name}>
                        <td>{u.user_name}</td>
                        <td className="mono-num">{formatDateTime(u.last_active)}</td>
                        <td className="mono-num">{formatDateTime(u.first_login)}</td>
                        <td className="mono-num">{u.login_count}</td>
                        <td className="mono-num">{u.page_view_count}</td>
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
                      <th>Path</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.recent.map((row, i) => (
                      <tr key={i}>
                        <td>{row.user_name}</td>
                        <td>{row.event_type === 'login' ? 'Login' : 'Page view'}</td>
                        <td>{row.path || '—'}</td>
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
