import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { WaveMark } from '../components/WaveMark';
import { SegmentedToggle } from '../components/SegmentedToggle';
import { accentForIndex } from '../config/palette';

const EVENT_LABEL = { login: 'Login', page_view: 'Page view', note_added: 'Note left' };
const EVENT_DOT_COLOR = { login: 'var(--intent-info)', page_view: 'var(--fg-dim)', note_added: 'var(--intent-success)' };

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

function formatShortDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric' }).format(d);
}

// A stable per-name index into the app's own categorical palette, so the
// same person always gets the same avatar color across refreshes — not a
// fresh hue each time the leaderboard happens to re-sort.
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function Avatar({ name }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span className="admin-avatar" style={{ background: accentForIndex(hashString(name)) }}>
      {initials}
    </span>
  );
}

function RankBadge({ rank }) {
  if (rank === 1) return <span className="admin-rank-badge">1</span>;
  return <span className="mono-num">{rank}</span>;
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

function StatTile({ label, value }) {
  return (
    <div className="stat-tile">
      <span className="spec">{label}</span>
      <span className="stat-tile-value mono-num">{value}</span>
    </div>
  );
}

const TREND_WIDTH = 700;
const TREND_HEIGHT = 120;
const TREND_PAD_LEFT = 30;
const TREND_PAD_RIGHT = 4;
const TREND_PAD_TOP = 10;
const TREND_PAD_BOTTOM = 20;

function ActivityTrendChart({ daily }) {
  const plotW = TREND_WIDTH - TREND_PAD_LEFT - TREND_PAD_RIGHT;
  const plotH = TREND_HEIGHT - TREND_PAD_TOP - TREND_PAD_BOTTOM;
  const maxCount = Math.max(...daily.map((d) => d.count), 1);
  const yMax = maxCount * 1.15;
  const slotWidth = plotW / daily.length;
  const barWidth = slotWidth * 0.55;

  function yFor(v) {
    return TREND_PAD_TOP + (1 - v / yMax) * plotH;
  }

  return (
    <svg
      viewBox={`0 0 ${TREND_WIDTH} ${TREND_HEIGHT}`}
      role="img"
      aria-label="Total logins, page views, and notes logged per day over the last 14 days"
    >
      <line
        x1={TREND_PAD_LEFT}
        x2={TREND_WIDTH - TREND_PAD_RIGHT}
        y1={TREND_HEIGHT - TREND_PAD_BOTTOM}
        y2={TREND_HEIGHT - TREND_PAD_BOTTOM}
        stroke="var(--line)"
        strokeWidth="1"
      />
      <text x={TREND_PAD_LEFT - 6} y={yFor(maxCount) + 3} textAnchor="end" className="chart-tick">
        {maxCount}
      </text>
      <text x={TREND_PAD_LEFT - 6} y={TREND_HEIGHT - TREND_PAD_BOTTOM} textAnchor="end" className="chart-tick">
        0
      </text>
      {daily.map((d, i) => {
        const cx = TREND_PAD_LEFT + slotWidth * (i + 0.5);
        const x = cx - barWidth / 2;
        const top = yFor(d.count);
        const height = TREND_HEIGHT - TREND_PAD_BOTTOM - top;
        const showLabel = i === 0 || i === daily.length - 1 || i % 3 === 0;
        return (
          <g key={d.date}>
            {d.count > 0 && (
              <rect x={x} y={top} width={barWidth} height={Math.max(0, height)} rx={2} fill="var(--volt)">
                <title>
                  {formatShortDate(d.date)} — {d.count} event{d.count === 1 ? '' : 's'}
                </title>
              </rect>
            )}
            {showLabel && (
              <text x={cx} y={TREND_HEIGHT - 6} textAnchor="middle" className="chart-tick">
                {formatShortDate(d.date)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function TopShowsRanked({ shows }) {
  if (!shows || shows.length === 0) {
    return <p className="empty-state spec">No show page views recorded yet.</p>;
  }
  const max = Math.max(...shows.map((s) => s.views));
  return (
    <div className="admin-rank-bars">
      {shows.map((s) => (
        <div className="admin-rank-bar-row" key={s.show_name}>
          <span className="admin-rank-bar-label">{s.show_name}</span>
          <div className="admin-rank-bar-track">
            <div className="admin-rank-bar-fill" style={{ width: `${(s.views / max) * 100}%` }} />
          </div>
          <span className="mono-num admin-rank-bar-value">{s.views}</span>
        </div>
      ))}
    </div>
  );
}

function ActivityFeed({ recent }) {
  if (!recent || recent.length === 0) {
    return <p className="empty-state spec">Nothing logged yet.</p>;
  }
  return (
    <div className="admin-feed-wrap">
      <ul className="admin-feed">
        {recent.map((row, i) => (
          <li className="admin-feed-item" key={i}>
            <span className="admin-feed-dot" style={{ background: EVENT_DOT_COLOR[row.event_type] }} />
            <span className="admin-feed-text">
              <strong>{row.user_name}</strong> {(EVENT_LABEL[row.event_type] || row.event_type).toLowerCase()}
              {row.show_name && <> — {row.show_name}</>}
            </span>
            <span className="mono-num admin-feed-time">{formatDateTime(row.created_at)}</span>
          </li>
        ))}
      </ul>
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
            <h2 className="detail-section-title">At a glance</h2>
            <div className="correlation-panel">
              <div className="stat-tile-row">
                <StatTile label="Active users" value={activity.summary.activeUsers} />
                <StatTile label="Logins" value={activity.summary.totalLogins} />
                <StatTile label="Page views" value={activity.summary.totalPageViews} />
                <StatTile label="Notes left" value={activity.summary.totalNotes} />
              </div>
            </div>
          </section>

          <section className="show-section">
            <h2 className="detail-section-title">Activity, last 14 days</h2>
            <div className="glass-panel admin-trend-chart">
              <ActivityTrendChart daily={activity.daily} />
            </div>
          </section>

          <section className="show-section">
            <h2 className="detail-section-title">Most-viewed shows</h2>
            <div className="correlation-panel">
              <TopShowsRanked shows={activity.topShows} />
            </div>
          </section>

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
                        <td>
                          <RankBadge rank={i + 1} />
                        </td>
                        <td>
                          <div className="admin-name-cell">
                            <Avatar name={u.user_name} />
                            {u.user_name}
                          </div>
                        </td>
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
            <ActivityFeed recent={activity.recent} />
          </section>
        </>
      )}
    </>
  );
}

function AccountsPanel() {
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [reveal, setReveal] = useState(null); // { name, password } — shown once, right after create/reset; never stored or fetchable again
  const [copied, setCopied] = useState(false);

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
      const account = await api.createAccount(name.trim());
      setReveal({ name: account.name, password: account.password });
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
      const result = await api.resetAccountPassword(account.id);
      setReveal({ name: result.name, password: result.password });
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

  function copyPassword() {
    navigator.clipboard?.writeText(reveal.password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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

      {reveal && (
        <div className="glass-panel password-reveal">
          <div className="password-reveal-info">
            <span className="spec">Password for {reveal.name} — shown once, copy it now. It can&rsquo;t be looked up again.</span>
            <span className="password-reveal-value">{reveal.password}</span>
          </div>
          <div className="password-reveal-actions">
            <button className="icon-button" onClick={copyPassword}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button className="icon-button" onClick={() => setReveal(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

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
                    <th>Status</th>
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
                        <span className="spec">{account.mustChangePassword ? 'Temporary password' : 'Password set by user'}</span>
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

// Mirrors server/ai/generateMeetingDeck.js's STAT_CATALOG/DEFAULT_STAT_KEYS —
// kept in sync manually (same dual-copy pattern as stats.js/showArtColor.js)
// since this list is just labels for the picker, not the formatting logic.
const STAT_OPTIONS = [
  { key: 'total_performance_combined', label: 'Total performance' },
  { key: 'audio_downloads_total', label: 'Audio downloads' },
  { key: 'youtube_views_total', label: 'YouTube views' },
  { key: 'ctr_1hr', label: '1hr CTR' },
  { key: 'ctr_24hr', label: '24hr CTR' },
  { key: 'avg_watch_pct', label: 'Watch-through' },
  { key: 'first_dropoff_pct', label: 'Early drop-off' },
];
const DEFAULT_DECK_STATS = ['total_performance_combined', 'audio_downloads_total', 'youtube_views_total', 'ctr_24hr', 'avg_watch_pct'];

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function MeetingDeckPanel() {
  const [startDate, setStartDate] = useState(() => isoDate(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)));
  const [endDate, setEndDate] = useState(() => isoDate(new Date()));
  const [selectedStats, setSelectedStats] = useState(DEFAULT_DECK_STATS);
  const [shows, setShows] = useState([]);
  const [selectedShows, setSelectedShows] = useState(null); // null until shows load, then defaults to "all"
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getShows().then((res) => {
      setShows(res);
      setSelectedShows(res.map((s) => s.show_name));
    });
  }, []);

  function toggleStat(key) {
    setSelectedStats((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function toggleShow(showName) {
    setSelectedShows((prev) => (prev.includes(showName) ? prev.filter((s) => s !== showName) : [...prev, showName]));
  }

  // Opens the tab synchronously (before the fetch starts) so the browser
  // doesn't treat it as an unrequested popup — the loading message is written
  // in immediately, then replaced with the real deck once it's generated.
  async function handleGenerate(e) {
    e.preventDefault();
    setError(null);
    if (selectedStats.length === 0) {
      setError('Pick at least one stat to show.');
      return;
    }
    if (!selectedShows || selectedShows.length === 0) {
      setError('Pick at least one show to include.');
      return;
    }
    const win = window.open('', '_blank');
    if (!win) {
      setError('Your browser blocked the new tab — allow pop-ups for this site and try again.');
      return;
    }
    win.document.write(
      '<!doctype html><html><body style="background:#0b0909;color:#f2efe9;font-family:-apple-system,sans-serif;padding:48px;">Generating your meeting deck — this can take up to a minute while each show gets an AI takeaway…</body></html>'
    );
    setGenerating(true);
    try {
      const params = new URLSearchParams({
        start: startDate,
        end: endDate,
        stats: selectedStats.join(','),
        shows: selectedShows.join(','),
      });
      const res = await fetch(`/api/admin/meeting-deck?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Could not generate the deck.');
      const html = await res.text();
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch (err) {
      win.close();
      setError(err.message || 'Could not generate the deck.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <div className="toolbar">
        <p className="spec" style={{ margin: 0 }}>
          Materials for your biweekly producer meeting
        </p>
      </div>

      <div className="glass-panel meeting-deck-form">
        <form onSubmit={handleGenerate}>
          <div className="meeting-deck-row">
            <label className="spec" htmlFor="deck-start">
              Start
            </label>
            <input id="deck-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <label className="spec" htmlFor="deck-end">
              End
            </label>
            <input id="deck-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>

          <div className="meeting-deck-row meeting-deck-stats-row">
            <span className="spec">Shows to include</span>
            <div className="meeting-deck-stat-toggles">
              <button type="button" className="meeting-deck-stat-toggle" onClick={() => setSelectedShows(shows.map((s) => s.show_name))}>
                All
              </button>
              <button type="button" className="meeting-deck-stat-toggle" onClick={() => setSelectedShows([])}>
                None
              </button>
              {shows.map((s) => (
                <button
                  type="button"
                  key={s.show_name}
                  className={`meeting-deck-stat-toggle${selectedShows?.includes(s.show_name) ? ' is-selected' : ''}`}
                  onClick={() => toggleShow(s.show_name)}
                >
                  {s.show_name}
                </button>
              ))}
            </div>
          </div>

          <div className="meeting-deck-row meeting-deck-stats-row">
            <span className="spec">Stats to show</span>
            <div className="meeting-deck-stat-toggles">
              {STAT_OPTIONS.map((stat) => (
                <button
                  type="button"
                  key={stat.key}
                  className={`meeting-deck-stat-toggle${selectedStats.includes(stat.key) ? ' is-selected' : ''}`}
                  onClick={() => toggleStat(stat.key)}
                >
                  {stat.label}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={generating}>
            {generating ? 'Generating…' : 'Generate deck'}
          </button>
        </form>
        <p className="meeting-deck-hint">
          Opens in a new tab — high-level performance per show, then every episode in range with its stats, AI
          insight, and producer notes. Print or save as PDF from there.
        </p>
      </div>

      {error && <p className="form-error spec">{error}</p>}
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
              { value: 'deck', label: 'Meeting deck' },
            ]}
            value={tab}
            onChange={setTab}
          />
          <button className="icon-button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      {tab === 'activity' && <ActivityPanel />}
      {tab === 'accounts' && <AccountsPanel />}
      {tab === 'deck' && <MeetingDeckPanel />}
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
