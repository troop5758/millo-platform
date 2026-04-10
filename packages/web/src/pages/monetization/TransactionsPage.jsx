/**
 * TransactionsPage — implicit route `/transactions`
 * Shows recent ledger transactions from GET /payments/wallet/transactions.
 *
 * https://milloapp.com
 */
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { SEO } from '../../components/SEO';
import { getUser } from '../../sdk/authApi';
import { fetchWalletTransactions } from '../../sdk/contentApi';

function fmtMoney(cents) {
  if (cents == null || Number.isNaN(Number(cents))) return '—';
  const n = Number(cents);
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n) / 100}`.replace(/\.0+$/, '');
}

export function TransactionsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getUser();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [txs, setTxs] = useState([]);

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true, state: { from: '/transactions' } });
      return;
    }
    setLoading(true);
    setError('');
    fetchWalletTransactions(30)
      .then((list) => setTxs(Array.isArray(list) ? list : []))
      .catch((e) => setError(e.message || 'Failed to load transactions'))
      .finally(() => setLoading(false));
  }, [user, navigate]);

  return (
    <>
      <SEO title={t('wallet.transactions', 'Transactions')} path="/transactions" />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-[var(--text)] mb-6">{t('wallet.transactions', 'Transactions')}</h1>

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
            {txs.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">{t('wallet.noTransactions', 'No transactions found.')}</p>
            ) : (
              txs.map((e) => (
                <div key={e._id || e.id || `${e.createdAt || ''}:${e.refType || ''}`} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--text)] truncate">
                        {e.type || e.refType || 'Transaction'}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-1">
                        {e.createdAt ? new Date(e.createdAt).toLocaleString() : '—'}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-2">
                        {e.refId || e.refIdStr || ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-[var(--text)]">
                        {fmtMoney(e.amountCents ?? e.amount ?? e.deltaCents)}
                      </div>
                      {e.direction && <div className="text-xs text-[var(--text-muted)] mt-1">{e.direction}</div>}
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

