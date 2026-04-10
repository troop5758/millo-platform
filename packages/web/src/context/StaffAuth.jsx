/**
 * Staff auth context — holds staff user for dashboard API calls (X-User-Id, X-User-Role).
 * In production, replace with real auth; for dev, can be set via localStorage.
 * https://milloapp.com
 */
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'millo_staff';
const USER_KEY = 'millo_user';
const ALLOWED_ROLES = ['admin', 'mod', 'support', 'ops'];

const defaultStaff = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { userId, role } = JSON.parse(raw);
      if (userId && ALLOWED_ROLES.includes(role)) return { userId: String(userId), role };
    }
    // If no staff identity but logged-in user has a staff role, use that (e.g. admin after first install)
    const userRaw = localStorage.getItem(USER_KEY);
    if (userRaw) {
      const user = JSON.parse(userRaw);
      if (user?.id && user?.role && ALLOWED_ROLES.includes(user.role))
        return { userId: String(user.id), role: user.role };
    }
  } catch (_) {}
  return null;
};

const StaffAuthContext = createContext(null);

export function StaffAuthProvider({ children }) {
  const [staffUser, setStaffUserState] = useState(defaultStaff);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const { userId, role } = JSON.parse(raw);
        if (userId && ALLOWED_ROLES.includes(role)) {
          setStaffUserState({ userId: String(userId), role });
          return;
        }
      } catch (_) {}
    }
    const userRaw = localStorage.getItem(USER_KEY);
    if (userRaw) {
      try {
        const user = JSON.parse(userRaw);
        if (user?.id && user?.role && ALLOWED_ROLES.includes(user.role))
          setStaffUserState({ userId: String(user.id), role: user.role });
      } catch (_) {}
    }
  }, []);

  const setStaffUser = useCallback((user) => {
    if (!user) {
      localStorage.removeItem(STORAGE_KEY);
      setStaffUserState(null);
      return;
    }
    const { userId, role } = user;
    if (userId && ALLOWED_ROLES.includes(role)) {
      const payload = { userId: String(userId), role };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setStaffUserState(payload);
    }
  }, []);

  const value = { staffUser, setStaffUser, allowedRoles: ALLOWED_ROLES };
  return <StaffAuthContext.Provider value={value}>{children}</StaffAuthContext.Provider>;
}

export function useStaffAuth() {
  const ctx = useContext(StaffAuthContext);
  if (!ctx) throw new Error('useStaffAuth must be used within StaffAuthProvider');
  return ctx;
}

export function hasStaffRole(staffUser, role) {
  if (!staffUser?.role) return false;
  const hierarchy = { admin: ['admin'], mod: ['admin', 'mod'], support: ['admin', 'mod', 'support'] };
  const allowed = hierarchy[role];
  return allowed ? allowed.includes(staffUser.role) : false;
}
