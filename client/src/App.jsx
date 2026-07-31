import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { api } from './api/client';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { ShowPage } from './pages/ShowPage';
import { Admin } from './pages/Admin';

// The producer app (shared APP_PASSWORD) — everything except /admin, which
// has its own independent password and shouldn't be gated behind this one.
function ProducerApp() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    api
      .getSession()
      .then((res) => setAuthenticated(res.authenticated))
      .finally(() => setAuthChecked(true));
  }, []);

  if (!authChecked) return null;
  if (!authenticated) return <Login onSuccess={() => setAuthenticated(true)} />;

  return (
    <Routes>
      <Route element={<Layout onLogout={() => setAuthenticated(false)} />}>
        <Route path="/" element={<Home />} />
        <Route path="/shows/:showName" element={<ShowPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<Admin />} />
        <Route path="/*" element={<ProducerApp />} />
      </Routes>
    </BrowserRouter>
  );
}
