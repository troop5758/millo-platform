/**
 * SessionsPage — multi-device management. List and revoke active sessions.
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { getUser, getSessions, invalidateSession, logout } from '../sdk/authApi';

const DEVICE_ICONS = { web: '💻', ios: '📱', android: '📱' };

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  const now = new Date();
  const diff = now - dt;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
  return dt.toLocaleDateString();
}

export function SessionsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getUser();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(null);

  useEffect(() => {
    if (!user) navigate('/login', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (!user) return;
    getSessions()
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [user]);

  const handleRevoke = async (sessionId) => {
    if (revoking) return;
    setRevoking(sessionId);
    try {
      await invalidateSession(sessionId);
      setSessions((prev) => prev.filter((s) => String(s.id) !== String(sessionId)));
      const current = sessions.find((s) => s.isCurrent && String(s.id) === String(sessionId));
      if (current) {
        await logout();
        navigate('/login', { replace: true });
        window.location.reload();
      }
    } catch (_) {}
    setRevoking(null);
  };

  if (!user) return null;

  return (
    <>
      <SEO title={t('sessions.title', 'Sessions & Devices')} description={t('sessions.desc', 'Manage your active sessions')} path="/settings/sessions" />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-[var(--text)] mb-2">{t('sessions.title', 'Sessions & Devices')}</h1>
        <p className="text-sm text-[var(--text-muted)] mb-8">{t('sessions.desc', 'View and revoke active sessions. Signing out on another device will log you out there.')}</p>

        {loading ? (
          <div className="text-sm text-[var(--text-muted)]">{t('common.loading', 'Loading…')}</div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t('sessions.none', 'No active sessions.')}</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`rounded-xl border p-4 flex items-center justify-between gap-4 ${
                  s.isCurrent ? 'border-[var(--accent)] bg-[var(--accent)]/5' : 'border-[var(--border)] bg-[var(--bg-card)]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-2xl shrink-0">{DEVICE_ICONS[s.deviceType] || '📱'}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text)] truncate">
                      {s.deviceType === 'web' ? t('sessions.deviceWeb', 'Web') : s.deviceType === 'ios' ? t('sessions.deviceIos', 'iPhone/iPad') : s.deviceType === 'android' ? t('sessions.deviceAndroid', 'Android') : s.deviceType}
                      {s.isCurrent && <span className="ml-2 text-xs text-[var(--accent)]">({t('sessions.current', 'This device')})</span>}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">{formatDate(s.createdAt)}</p>
                  </div>
                </div>
                {!s.isCurrent && (
                  <button
                    type="button"
                    onClick={() => handleRevoke(s.id)}
                    disabled={revoking === s.id}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    {revoking === s.id ? t('common.loading', '…') : t('sessions.revoke', 'Revoke')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <Link to="/profile" className="inline-block mt-8 text-sm text-[var(--accent)] hover:underline">
          {t('common.back', 'Back')} → {t('nav.profile', 'Profile')}
        </Link>
      </div>
    </>
  );
}
