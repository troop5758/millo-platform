/**
 * NotificationsPage — full in-app notification centre.
 * GET /content/notifications  ·  POST /content/notifications/read
 * Real-time updates via the user WebSocket.
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { getUser } from '../sdk/authApi';
import { fetchNotificationsPage, markNotificationsRead } from '../sdk/contentApi';
import { API_BASE } from '../config/api.js';
const TOKEN_KEY = 'millo_token';

function timeAgo(dateStr) {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60000)   return 'just now';
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ago`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h ago`;
  if (ms < 2592000000) return `${Math.floor(ms / 86400000)}d ago`;
  return `${Math.floor(ms / 2592000000)}mo ago`;
}

const TYPE_ICON = {
  follow:    (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
    </svg>
  ),
  gift:      (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
    </svg>
  ),
  bid:       (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  subscribe: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  live:      (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
    </svg>
  ),
  system:    (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
};

const TYPE_COLOR = {
  follow:    'bg-blue-500/10 text-blue-500',
  gift:      'bg-amber-500/10 text-amber-500',
  bid:       'bg-violet-500/10 text-violet-500',
  subscribe: 'bg-emerald-500/10 text-emerald-500',
  live:      'bg-red-500/10 text-red-500',
  system:    'bg-[var(--accent)]/10 text-[var(--accent)]',
};

function NotificationItem({ n, onMarkRead }) {
  const icon   = TYPE_ICON[n.type]  || TYPE_ICON.system;
  const color  = TYPE_COLOR[n.type] || TYPE_COLOR.system;

  const linkTo = (() => {
    if (!n.meta) return null;
    if (n.type === 'follow'    && n.meta.followerId)  return `/creator/${n.meta.followerId}`;
    if (n.type === 'bid'       && n.meta.auctionId)   return `/creator/${n.meta.creatorId}/auctions`;
    if (n.type === 'gift'      && n.meta.streamId)    return `/live`;
    if (n.type === 'subscribe' && n.meta.subscriberId) return `/creator/${n.meta.subscriberId}`;
    if (n.type === 'live'      && n.meta.streamId)    return `/live`;
    return null;
  })();

  const inner = (
    <div className={`flex items-start gap-4 px-5 py-4 border-b border-[var(--border)] transition-colors hover:bg-[var(--bg-elevated)] ${!n.read ? 'bg-[var(--accent)]/3' : ''}`}
      onClick={() => !n.read && onMarkRead(n._id)}>
      {/* Icon */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold text-[var(--text)] ${!n.read ? 'font-bold' : ''}`}>{n.title}</p>
        {n.body && <p className="text-sm text-[var(--text-muted)] mt-0.5">{n.body}</p>}
        <p className="text-xs text-[var(--text-muted)] mt-1">{timeAgo(n.createdAt)}</p>
      </div>
      {/* Unread dot */}
      {!n.read && (
        <div className="w-2 h-2 rounded-full bg-[var(--accent)] mt-2 shrink-0" />
      )}
    </div>
  );

  return linkTo
    ? <Link to={linkTo} className="block no-underline">{inner}</Link>
    : <div>{inner}</div>;
}

const FILTERS = ['all', 'follow', 'gift', 'subscribe', 'bid', 'live', 'system'];

export function NotificationsPage() {
  const { t }    = useTranslation();
  const user     = getUser();
  const navigate = useNavigate();
  const wsRef    = useRef(null);

  const [notifications, setNotifications] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [filter,        setFilter]        = useState('all');
  const [page,          setPage]          = useState(1);
  const [hasMore,       setHasMore]       = useState(true);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const LIMIT = 20;

  useEffect(() => {
    if (!user) navigate('/login', { replace: true });
  }, [user, navigate]);

  const load = useCallback(async (pg = 1) => {
    if (pg === 1) setLoading(true); else setLoadingMore(true);
    try {
      const data = await fetchNotificationsPage({ filter, page: pg, limit: LIMIT });
      const incoming = data.notifications || [];
      setNotifications((prev) => pg === 1 ? incoming : [...prev, ...incoming]);
      setHasMore(data.hasMore ?? incoming.length === LIMIT);
      setPage(pg);
    } catch { /* use cached */ }
    setLoading(false);
    setLoadingMore(false);
  }, [filter]);

  useEffect(() => { load(1); }, [load]);

  // Real-time via user WebSocket
  useEffect(() => {
    if (!user) return;
    const token  = localStorage.getItem(TOKEN_KEY) || '';
    const wsBase = API_BASE.replace(/^http/, 'ws');
    const ws     = new WebSocket(`${wsBase}/ws/user?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'notification' && msg.data) {
          setNotifications((prev) => [msg.data, ...prev]);
        }
      } catch { /* ignore */ }
    };

    return () => ws.close();
  }, [user]);

  const markRead = useCallback(async (id) => {
    setNotifications((prev) => prev.map((n) => n._id === id ? { ...n, read: true } : n));
    markNotificationsRead([id]).catch(() => null);
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    markNotificationsRead(null).catch(() => null);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filtered    = filter === 'all' ? notifications : notifications.filter((n) => n.type === filter);

  return (
    <>
      <SEO title="Notifications — Millo" description="Your Millo notifications." path="/notifications" />
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[var(--text)]">{t('notifications.title')}</h1>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[var(--accent)] text-white text-xs font-bold">{unreadCount}</span>
            )}
          </div>
          {unreadCount > 0 && (
            <button type="button" onClick={markAllRead}
              className="text-sm text-[var(--accent)] hover:underline font-medium">
              {t('notifications.markAllRead')}
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-3 mb-4 scrollbar-none">
          {FILTERS.map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${filter === f
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'}`}>
              {t(`notifications.filters.${f}`, { defaultValue: f })}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
          {loading ? (
            <div className="py-16 flex justify-center">
              <div className="w-7 h-7 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-[var(--text-muted)]">
              <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <p className="font-medium">
                {filter === 'all' ? t('notifications.empty') : t('notifications.emptyFiltered', { type: filter })}
              </p>
              <p className="text-sm">{t('notifications.emptyDesc')}</p>
            </div>
          ) : (
            <>
              {filtered.map((n) => (
                <NotificationItem key={String(n._id)} n={n} onMarkRead={markRead} />
              ))}
              {hasMore && (
                <div className="py-4 flex justify-center border-t border-[var(--border)]">
                  {loadingMore ? (
                    <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <button type="button" onClick={() => load(page + 1)}
                      className="text-sm text-[var(--accent)] hover:underline font-medium">
                      Load more
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
