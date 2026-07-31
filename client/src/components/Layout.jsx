import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { api } from '../api/client';
import { WaveMark } from './WaveMark';

export function Layout({ onLogout }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  async function handleLogout() {
    await api.logout();
    onLogout();
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link className="app-brand" to="/">
          <WaveMark />
          <div className="app-title-block">
            <span className="app-title">Episode Performance</span>
            <span className="app-subtitle">Wave Originals</span>
          </div>
        </Link>
        <div className="app-header-actions">
          <button className="icon-button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button className="icon-button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
