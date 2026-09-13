import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AuthContext = createContext(null);
const STORAGE_KEY = 'mrl.auth.user';

const isWeb = typeof window !== 'undefined' && window.__MRL_WEB__;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    if (isWeb) return null; // web mode: rely on server whoami
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) {
      return null;
    }
  });
  const [checked, setChecked] = useState(!isWeb);

  // In web mode, verify server session on mount (session cookie may still be valid)
  useEffect(() => {
    if (!isWeb) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await window.api.auth.whoami();
        if (!cancelled && res?.user) setUser(res.user);
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // In Electron, mirror to sessionStorage so page refresh keeps you signed in
  useEffect(() => {
    if (isWeb) return;
    if (user) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else sessionStorage.removeItem(STORAGE_KEY);
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      isReady: checked,
      async login(username, password) {
        const res = await window.api.auth.login({ username, password });
        if (res.ok) setUser(res.user);
        return res;
      },
      async logout() {
        // In web mode, tell the server to destroy the session cookie
        try {
          if (window.api.auth.logout) await window.api.auth.logout();
        } catch (_e) {
          // Ignore — always clear local state below
        }
        setUser(null);
      },
    }),
    [user, checked]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
