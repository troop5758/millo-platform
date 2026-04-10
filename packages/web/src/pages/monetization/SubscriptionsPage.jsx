/**
 * SubscriptionsPage — implicit route `/subscriptions`
 * Lists user's subscriptions + allows cancel.
 *
 * Backend:
 *  - GET  /payments/subscriptions/my
 *  - POST /payments/subscriptions/cancel
 *
 * https://milloapp.com
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../../components/SEO';
import { getUser } from '../../sdk/authApi';
import { fetchMySubscriptions, cancelSubscription } from '../../sdk/contentApi';

export function SubscriptionsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getUser();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [subs, setSubs] = useState([]);
  const [cancellingId, setCancellingId] = useState(null);

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true, state: { from: '/subscriptions' } });
      return;
    }
    setLoading(true);
    setError('');
    fetchMySubscriptions()
      .then((list) => setSubs(Array.isArray(list) ? list : []))
      .catch((e) => setError(e.message || 'Failed to load subscriptions'))
      .finally(() => setLoading(false));
  }, [user, navigate]);

  const cancelOne = async (subId) => {
    if (!subId || cancellingId) return;
    setCancellingId(subId);
    setError('');
    try {
      await cancelSubscription(subId);
      setSubs((prev) => prev.filter((s) => String(s._id || s.id) !== String(subId)));
    } catch (e) {
      setError(e.message || 'Failed to cancel subscription');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <>
      <SEO title={t('subscribe.subscriptionsTitle', 'Subscriptions')} path="/subscriptions" />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-[var(--text)] mb-6">{t('subscribe.subscriptionsTitle', 'Subscriptions')}</h1>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[var(--error)]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {subs.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">{t('subscribe.none', 'You are not subscribed to any creators.')}</p>
            ) : (
              subs.map((s) => {
                const subId = s._id || s.id;
                const creatorId = s.creatorId || s.creator?._id || s.creator?.id || '';
                const name = s.creatorDisplayName || s.creator?.displayName || s.creator?.username || s.creatorName || 'Creator';
                const price = s.priceCents != null ? `$${(Number(s.priceCents) / 100).toFixed(2)}` : null;
                return (
                  <div key={subId} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--text)] truncate">{name}</div>
                        <div className="text-xs text-[var(--text-muted)] mt-1">
                          {price ? `Price: ${price}` : '—'}
                        </div>
                        {s.endsAt ? (
                          <div className="text-xs text-[var(--text-muted)] mt-1">
                            Ends: {new Date(s.endsAt).toLocaleDateString()}
                          </div>
                        ) : null}
                      </div>
                      <div className="text-right flex flex-col items-end gap-2">
                        {creatorId ? (
                          <Link to={`/creator/${encodeURIComponent(creatorId)}`} className="text-sm text-[var(--accent)] hover:underline font-medium">
                            View
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => cancelOne(subId)}
                          disabled={cancellingId === subId}
                          className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-sm font-semibold disabled:opacity-50"
                        >
                          {cancellingId === subId ? 'Cancelling…' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </>
  );
}

