/**
 * NotificationDropdown — bell icon with real-time notification list.
 * Fetches from /content/notifications, marks read on open.
 * https://milloapp.com
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchNotifications, markNotificationsRead } from '../sdk/contentApi';
import { MilloCoin } from './MilloCoin';
import { getToken } from '../sdk/authApi';
import { useUserSocket, useSocketEvent } from '../hooks/useUserSocket';

const NOTIF_ICONS = {
  newFollower:          '👤',
  newGift:              '🎁',
  liveStart:            '🔴',
  message:              '💬',
  coinPurchase:         null,
  subscriptionActivated:'⭐',
  default:              '🔔',
};

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function notifLabel(n) {
  const p = n.payload || {};
  switch (n.type) {
    case 'newFollower':           return `${p.followerName || 'Someone'} started following you`;
    case 'newGift':               return `${p.senderName || 'Someone'} sent you a ${p.giftName || 'gift'} (${p.coins} coins)`;
    case 'liveStart':             return `${p.creatorName || 'A creator'} went live`;
    case 'message':               return `New message from ${p.senderName || 'someone'}`;
    case 'coinPurchase':          return `${p.totalCoins} coins added to your wallet`;
    case 'subscriptionActivated': return 'Your subscription is now active';
    default:                      return p.message || n.type;
  }
}

export function NotificationDropdown() {
  const [open,    setOpen]    = useState(false);
  const [notifs,  setNotifs]  = useState([]);
  const [unread,  setUnread]  = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const isLoggedIn = !!getToken();

  const load = useCallback(async () => {
    if (!isLoggedIn) return;
    setLoading(true);
    try {
      const data = await fetchNotifications();
      setNotifs(data.notifications || []);
      setUnread(data.unreadCount || 0);
    } catch { /* silently ignore */ }
    setLoading(false);
  }, [isLoggedIn]);

  // Load on mount + poll every 60s (fallback for when WebSocket is unavailable)
  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  // Real-time push via WebSocket — prepend new notification and bump unread count
  useUserSocket();
  useSocketEvent('millo:notification', useCallback((notif) => {
    setNotifs((prev) => [notif, ...prev].slice(0, 50));
    setUnread((n) => n + 1);
  }, []));

  // Mark read when dropdown opens
  useEffect(() => {
    if (open && unread > 0) {
      markNotificationsRead().then(() => {
        setUnread(0);
        setNotifs((ns) => ns.map((n) => ({ ...n, read: true })));
      }).catch(() => {});
    }
  }, [open, unread]);

  // Close on outside click
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!isLoggedIn) {
    return (
      <Link to="/login" className="relative w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card)] transition-colors">
        <BellIcon />
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-card)] transition-colors"
        aria-label="Notifications"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
            <h3 className="font-semibold text-sm text-[var(--text)]">Notifications</h3>
            {notifs.some((n) => !n.read) && (
              <button
                onClick={() => markNotificationsRead().then(() => { setUnread(0); setNotifs((ns) => ns.map((n) => ({ ...n, read: true }))); })}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border)]">
            {loading && notifs.length === 0 && (
              <div className="py-8 text-center text-[var(--text-muted)] text-sm">Loading…</div>
            )}
            {!loading && notifs.length === 0 && (
              <div className="py-8 text-center text-[var(--text-muted)] text-sm">No notifications yet</div>
            )}
            {notifs.map((n) => (
              <div
                key={n._id}
                className={`flex gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-card)] ${!n.read ? 'bg-[var(--accent)]/5' : ''}`}
              >
                <div className="text-lg shrink-0 leading-none mt-0.5 flex items-center">
                  {n.type === 'coinPurchase'
                    ? <MilloCoin size={22} />
                    : (NOTIF_ICONS[n.type] || NOTIF_ICONS.default)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${!n.read ? 'text-[var(--text)] font-medium' : 'text-[var(--text-muted)]'}`}>
                    {notifLabel(n)}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">{timeAgo(n.createdAt)}</p>
                </div>
                {!n.read && <div className="w-2 h-2 rounded-full bg-[var(--accent)] shrink-0 mt-1.5" />}
              </div>
            ))}
          </div>

          <div className="px-4 py-2.5 border-t border-[var(--border)] text-center">
            <button onClick={() => setOpen(false)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}
