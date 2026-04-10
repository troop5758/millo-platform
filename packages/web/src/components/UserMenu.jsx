/**
 * UserMenu — avatar dropdown for logged-in users.
 * Shows: profile, go live, messages, coins, pricing, logout.
 * Replaces the "Login" button when a session exists.
 * https://milloapp.com
 */
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getUser, logout } from '../sdk/authApi';
import { MilloCoin } from './MilloCoin';

export function UserMenu() {
  const [open, setOpen]   = useState(false);
  const [user, setUser]   = useState(() => getUser());
  const ref               = useRef(null);
  const navigate          = useNavigate();

  // Sync user from storage when other tabs log in/out
  useEffect(() => {
    const sync = () => setUser(getUser());
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    setOpen(false);
    await logout();
    setUser(null);
    navigate('/', { replace: true });
  };

  if (!user) return null;

  const initials = (user.displayName || user.email || 'U')
    .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const MENU = [
    { to: '/profile',  label: 'My Profile',  icon: '👤' },
    { to: '/wallet',   label: 'Wallet',      icon: '💰' },
    { to: '/go-live',  label: 'Go Live',     icon: '🔴' },
    { to: '/messages', label: 'Messages',    icon: '💬' },
    { to: '/coins',    label: 'Buy Coins',   icon: null, coinIcon: true },
    { to: '/pricing',  label: 'Pricing',     icon: '⭐' },
    { to: '/settings/privacy', label: 'Privacy & Data', icon: '🔒' },
    { to: '/settings/sessions', label: 'Sessions & Devices', icon: '📱' },
    { to: '/blocked',  label: 'Blocked Users', icon: '🚫' },
    { to: '/tv-pairing', label: 'Connect TV', icon: '📺' },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl pl-1 pr-3 py-1 hover:bg-[var(--bg-card)] transition-colors"
        aria-label="User menu"
      >
        <div className="w-7 h-7 rounded-full bg-[var(--accent)] overflow-hidden flex items-center justify-center text-white text-xs font-bold shrink-0">
          {user.avatarUrl
            ? <img src={user.avatarUrl} alt={initials} className="w-full h-full object-cover" />
            : initials}
        </div>
        <span className="hidden sm:block text-sm font-medium text-[var(--text)] max-w-[100px] truncate">
          {user.displayName || user.email?.split('@')[0]}
        </span>
        <svg className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-2xl z-50 overflow-hidden">
          {/* Account header */}
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <p className="text-sm font-semibold text-[var(--text)] truncate">
              {user.displayName || 'Creator'}
            </p>
            <p className="text-xs text-[var(--text-muted)] truncate">{user.email}</p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            {MENU.map(({ to, label, icon, coinIcon }) => (
              <Link key={to} to={to} onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text)] hover:bg-[var(--bg-card)] transition-colors">
                {coinIcon ? <MilloCoin size={18} /> : <span className="text-base leading-none">{icon}</span>}
                {label}
              </Link>
            ))}
          </div>

          {/* Logout */}
          <div className="border-t border-[var(--border)] py-1">
            <button type="button" onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-left">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
