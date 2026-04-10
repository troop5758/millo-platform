import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchMe, logout as apiLogout } from '../api/auth';
import { getToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        try { setUser(await fetchMe()); } catch { /* expired */ }
      }
      setLoading(false);
    })();
  }, []);

  const refresh = async () => {
    try { setUser(await fetchMe()); } catch { setUser(null); }
  };

  const signOut = async () => {
    await apiLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
