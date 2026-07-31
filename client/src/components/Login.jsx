import { useState } from 'react';
import { api } from '../api/client';
import { WaveMark } from './WaveMark';

export function Login({ onSuccess }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.login(password);
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
        <h1 className="login-title">Episode Performance</h1>
        <p className="spec login-subtitle">Producer access only</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
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
