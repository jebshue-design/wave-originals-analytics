async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    const err = new Error('unauthenticated');
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getSession: () => request('/auth/session'),
  login: (password, name) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ password, name }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  changePassword: (newPassword) =>
    request('/auth/change-password', { method: 'POST', body: JSON.stringify({ newPassword }) }),
  logPageView: (path) => request('/activity/pageview', { method: 'POST', body: JSON.stringify({ path }) }),
  adminLogin: (password) =>
    request('/admin/login', { method: 'POST', body: JSON.stringify({ password }) }),
  adminLogout: () => request('/admin/logout', { method: 'POST' }),
  getAdminSession: () => request('/admin/session'),
  getActivity: () => request('/admin/activity'),
  getAccounts: () => request('/admin/accounts'),
  createAccount: (name) => request('/admin/accounts', { method: 'POST', body: JSON.stringify({ name }) }),
  resetAccountPassword: (id) => request(`/admin/accounts/${id}/reset-password`, { method: 'POST' }),
  deleteAccount: (id) => request(`/admin/accounts/${id}`, { method: 'DELETE' }),
  getShows: () => request('/shows'),
  getEpisodes: (show) => request(`/episodes${show ? `?show=${encodeURIComponent(show)}` : ''}`),
  getEpisode: (id) => request(`/episodes/${id}`),
  addNote: (id, note) =>
    request(`/episodes/${id}/notes`, { method: 'POST', body: JSON.stringify(note) }),
  updateNote: (id, noteId, note) =>
    request(`/episodes/${id}/notes/${noteId}`, { method: 'PUT', body: JSON.stringify(note) }),
  regenerateInsight: (id) => request(`/episodes/${id}/regenerate-insight`, { method: 'POST' }),
  getThumbnailPatterns: (show) => request(`/thumbnail-patterns?show=${encodeURIComponent(show)}`),
  getRetentionStickiness: (show) => request(`/retention-stickiness?show=${encodeURIComponent(show)}`),
  askShow: (show, question, history) =>
    request(`/ask?show=${encodeURIComponent(show)}`, {
      method: 'POST',
      body: JSON.stringify({ question, history }),
    }),
};
