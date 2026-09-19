import { createContext, useContext, useEffect, useState } from 'react';
import api, { TOKEN_KEY } from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }

    // Never trust the token's own claims for role/status — ask the server,
    // which re-reads the user row on every request. A deactivated or
    // rejected account must not render a dashboard just because the JWT
    // it's carrying hasn't expired yet.
    api
      .get('/auth/me', { unwrap: 'user' })
      .then((me) => setUser(me))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(login_id, password) {
    // Multi-key unwrap rather than raw: login returns token + user as two flat
    // top-level keys, and raw would skip the missing-key guard on the one
    // screen every user starts from — a renamed `token` would fail here with
    // no explanation at all.
    const { token, user: loggedIn } = await api.post(
      '/auth/login',
      { login_id, password },
      { unwrap: ['token', 'user'] }
    );
    localStorage.setItem(TOKEN_KEY, token);
    setUser(loggedIn);
    return loggedIn;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }

  // Re-read /auth/me into context. Parent → Settings needs this after
  // PUT /auth/contact so the locked "current number" is the last successful
  // read, not the draft (§5b). Login already setUser from its own unwrap.
  async function refresh() {
    const me = await api.get('/auth/me', { unwrap: 'user' });
    setUser(me);
    return me;
  }

  // R2 (2026-09-19) — SWAP THE STORED TOKEN FOR A REPLACEMENT THE SERVER
  // JUST MINTED, then re-read the user behind it.
  //
  // WHY THIS EXISTS AT ALL. R1 gave every account a `token_version`, bumped
  // by every password write, and middleware/auth.js rejects any token
  // carrying an older value. That is the point — a reset must kill the
  // sessions the old password left open. But it also kills the session of
  // the person doing the changing, so PUT /auth/change-password hands back a
  // token at the new version. Without this function the client throws that
  // token away and the caller's very next request 401s: changing your
  // password in Settings would sign you out of the tab you did it in.
  //
  // THE ORDER MATTERS AND IS NOT INTERCHANGEABLE. The token goes into
  // storage BEFORE /auth/me is called, because the axios interceptor reads
  // it per request — calling refresh() first would send the dead one, take
  // a 401, and log the user out on the success path.
  //
  // It also clears `must_change_password` in context, which is what lets the
  // forced-change screen route away from itself: that flag comes from the
  // server row, never from a local assumption about what we just wrote.
  async function applyToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
    return refresh();
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, applyToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
