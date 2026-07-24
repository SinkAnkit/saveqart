import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.me();
      setUser(user);
    } catch {
      setUser(null);
      setToken(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (localStorage.getItem('saveqart_token')) await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = async (email, password) => {
    const { token, user } = await api.login({ email, password });
    setToken(token);
    setUser(user);
  };

  const signup = async (name, email, password) => {
    const { token, user } = await api.signup({ name, email, password });
    setToken(token);
    setUser(user);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (_e) {
      /* ignore network errors on logout */
    }
    setToken(null);
    setUser(null);
  };

  const updateLocation = async (payload) => {
    const { user } = await api.setLocation(payload);
    setUser(user);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, updateLocation, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
