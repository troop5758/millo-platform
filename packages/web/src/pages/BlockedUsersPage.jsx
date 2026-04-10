/**
 * BlockedUsersPage — list and unblock users.
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { getUser } from '../sdk/authApi';
import { fetchBlockedUsersWithProfiles, unblockUser } from '../sdk/contentApi';

function Avatar({ name, url, size = 10 }) {
  const initials = (name || 'U').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className={`w-${size} h-${size} rounded-full bg-[var(--accent)] overflow-hidden flex items-center justify-center text-white text-xs font-bold shrink-0`}>
      {url ? <img src={url} alt={name} className="w-full h-full object-cover" /> : initials}
    </div>
  );
}

export function BlockedUsersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getUser();
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unblocking, setUnblocking] = useState(null);

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    fetchBlockedUsersWithProfiles()
      .then(setBlocked)
      .catch(() => setError(t('blocked.loadError', 'Failed to load blocked users')))
      .finally(() => setLoading(false));
  }, [user, navigate, t]);

  const handleUnblock = async (userId) => {
    setUnblocking(userId);
    try {
      await unblockUser(userId);
      setBlocked((prev) => prev.filter((b) => String(b.userId) !== String(userId)));
    } catch {
      setError(t('blocked.unblockFailed', 'Failed to unblock'));
    }
    setUnblocking(null);
  };

  if (!user) return null;

  return (
    <>
      <SEO title={t('blocked.title', 'Blocked users')} description={t('blocked.desc', 'Manage blocked users')} path="/blocked" />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-[var(--text)] mb-2">{t('blocked.title', 'Blocked users')}</h1>
        <p className="text-sm text-[var(--text-muted)] mb-6">{t('blocked.desc', 'Users you have blocked. Unblock to allow messages and interactions.')}</p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="h-24 rounded-xl bg-[var(--bg-card)] animate-pulse" />
        ) : blocked.length === 0 ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-12 text-center">
            <p className="text-[var(--text-muted)]">{t('blocked.empty', 'You have not blocked anyone.')}</p>
            <Link to="/profile" className="inline-block mt-4 text-sm text-[var(--accent)] hover:underline">
              {t('common.back', 'Back')} → {t('nav.profile', 'Profile')}
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {blocked.map((b) => (
              <li
                key={b.userId || b._id}
                className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={b.displayName} url={b.avatarUrl} size={10} />
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--text)] truncate">{b.displayName || b.email?.split('@')[0] || 'User'}</p>
                    {b.username && <p className="text-xs text-[var(--text-muted)]">@{b.username}</p>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnblock(b.userId)}
                  disabled={unblocking === b.userId}
                  className="shrink-0 px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-elevated)] disabled:opacity-50"
                >
                  {unblocking === b.userId ? t('common.loading', '…') : t('creator.unblock', 'Unblock')}
                </button>
              </li>
            ))}
          </ul>
        )}

        <Link to="/profile" className="inline-block mt-6 text-sm text-[var(--accent)] hover:underline">
          ← {t('nav.profile', 'Profile')}
        </Link>
      </div>
    </>
  );
}
