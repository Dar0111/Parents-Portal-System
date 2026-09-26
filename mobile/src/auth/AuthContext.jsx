import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api, { setSessionEndedListener } from '../api/client';
import extractError from '../api/extractError';
import * as tokenStore from './tokenStore';
import { classifyAuthFailure } from './authFailure';

// THE MOBILE TWIN OF client/src/auth/AuthContext.jsx. Same three rules:
//
//   - never trust the token's claims for role or status; ask /auth/me, which
//     re-reads the row on every request;
//   - ONLY A 401 ENDS THE SESSION (pre-Stage-5 #4). Anything else — offline,
//     a 503 from a stopped MySQL, a hung request past the 15 s timeout — keeps
//     the token and exposes `authError` for a retry (auth/authFailure.js);
//   - a write that revokes must hand back a replacement token, and
//     `applyToken` stores it BEFORE re-reading /auth/me, in that order.
//
// The one structural difference: the web's interceptor redirected with
// `window.location`; here it calls the listener registered below, which sets
// `user` to null and stores the reason. The root navigator does the rest by
// rendering the auth stack whenever `user` is null.

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const readSession = useCallback(async () => {
    const token = await tokenStore.load();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setAuthError(null);
    try {
      const me = await api.get('/auth/me', { unwrap: 'user' });
      setUser(me);
    } catch (err) {
      if (classifyAuthFailure(err) === 'unauthenticated') {
        // The interceptor has already cleared the store and stored the reason;
        // this only mirrors it into context.
        await tokenStore.clear();
        setUser(null);
      } else {
        setAuthError(extractError(err));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    readSession();
  }, [readSession]);

  // The 401 branch of api/client.js lands here for every request, not only
  // /auth/me — a deactivation takes effect on the user's very next request.
  useEffect(() => {
    setSessionEndedListener((reason) => {
      tokenStore.storeLogoutReason(reason);
      setUser(null);
    });
    return () => setSessionEndedListener(null);
  }, []);

  const retry = useCallback(() => {
    if (!loading) readSession();
  }, [loading, readSession]);

  async function login(login_id, password) {
    const { token, user: loggedIn } = await api.post(
      '/auth/login',
      { login_id, password },
      { unwrap: ['token', 'user'] }
    );
    await tokenStore.save(token);
    setUser(loggedIn);
    return loggedIn;
  }

  async function logout() {
    await tokenStore.clear();
    setUser(null);
  }

  async function refresh() {
    const me = await api.get('/auth/me', { unwrap: 'user' });
    setUser(me);
    return me;
  }

  async function applyToken(token) {
    await tokenStore.save(token);
    return refresh();
  }

  return (
    <AuthContext.Provider value={{ user, loading, authError, retry, login, logout, refresh, applyToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
