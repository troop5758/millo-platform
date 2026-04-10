/**
 * PayoutsPage — implicit route `/payouts`
 * Shows payout request history from GET /payments/payouts/history.
 *
 * https://milloapp.com
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../../components/SEO';
import TrustBadge from '../../components/TrustBadge';
import { getUser } from '../../sdk/authApi';
import { fetchPayoutHistory } from '../../sdk/contentApi';

function fmtCents(c) {
  if (c == null || Number.isNaN(Number(c))) return '$0.00';
  return '$' + (Number(c) / 100).toFixed(2);
}

export function PayoutsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getUser();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payouts, setPayouts] = useState([]);

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true, state: { from: '/payouts' } });
      return;
    }
    setLoading(true);
    setError('');
    fetchPayoutHistory()
      .then((list) => setPayouts(Array.isArray(list) ? list : []))
      .catch((e) => setError(e.message || 'Failed to load payouts'))
      .finally(() => setLoading(false));
  }, [user, navigate]);

  return (
    <>
      <SEO title={t('wallet.payouts', 'Payouts')} path="/payouts" />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between gap-3 mb-6">
          <h1 className="text-2xl font-bold text-[var(--text)]">{t('wallet.payouts', 'Payouts')}</h1>
          <Link to="/wallet" className="text-sm text-[var(--accent)] hover:underline font-medium">
            {t('wallet.requestPayout', 'Request payout')}
          </Link>
        </div>

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
            {payouts.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">{t('wallet.noPayouts', 'No payouts found.')}</p>
            ) : (
              payouts.map((p) => (
                <div key={p._id || p.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-[var(--text)]">
                        {p.status || 'pending'}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-1">
                        {p.createdAt ? new Date(p.createdAt).toLocaleString() : '—'}
                      </div>
                      {p.provider && <div className="text-xs text-[var(--text-muted)] mt-2">Provider: {p.provider}</div>}
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-[var(--text)]">{fmtCents(p.amountCents ?? p.amount)}</div>
                      {p.destination && <div className="text-xs text-[var(--text-muted)] mt-1 truncate">{String(p.destination)}</div>}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}

