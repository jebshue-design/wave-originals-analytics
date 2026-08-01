import { useState } from 'react';
import { api } from '../api/client';
import { WaveMark } from './WaveMark';

// Shown once, right after a first login (or a login right after an admin
// password reset) on an admin-assigned password — gated by the session's
// mustChangePassword flag, not a route, so there's nothing to navigate past.
export function ChangePassword({ onDone }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords don’t match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.changePassword(newPassword);
      onDone();
    } catch (err) {
      setError(err.message || 'Could not update your password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <WaveMark className="login-mark" />
        <h1 className="login-title">Set your password</h1>
        <p className="spec login-subtitle">You&rsquo;re using a temporary password &mdash; choose your own to continue</p>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password"
          autoFocus
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
        />
        {error && <p className="form-error spec">{error}</p>}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Set password'}
        </button>
      </form>
    </div>
  );
}
