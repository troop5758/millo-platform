/**
 * WalletPage — dedicated balance, transactions, and payout.
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { TrustLabeledBadge } from '../components/TrustBadge';
import { OperationalStubBanner } from '../components/OperationalStubBanner';
import { useFeatureStatus } from '../trust/TrustStatusContext.jsx';
import { getUser } from '../sdk/authApi';
import { fetchWallet, fetchPayoutHistory, fetchCreatorPayoutRequirements, requestPayout } from '../sdk/contentApi';

function fmtCents(c) {
  if (!c) return '$0.00';
  return '$' + (c / 100).toFixed(2);
}

export function WalletPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getUser();
  const [wallet, setWallet] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payoutAmt, setPayoutAmt] = useState('');
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState('');
  const [payoutRequirements, setPayoutRequirements] = useState(null);
  const kycTruth = useFeatureStatus('kyc');

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    Promise.all([fetchWallet(), fetchPayoutHistory(), fetchCreatorPayoutRequirements().catch(() => null)])
      .then(([w, p, req]) => {
        setWallet(w);
        setPayouts(p || []);
        setPayoutRequirements(req && req.ok ? req : null);
      })
      .catch(() => setError(t('profilePage.loadError', 'Failed to load wallet')))
      .finally(() => setLoading(false));
  }, [user, navigate, t]);

  const handleRequestPayout = async () => {
    const cents = Math.round(parseFloat(payoutAmt) * 100);
    if (!cents || cents < 500) {
      setPayoutMsg(t('profilePage.payoutMinError', 'Minimum payout is $5.00'));
      return;
    }
    setPayoutBusy(true);
    setPayoutMsg('');
    try {
      const res = await requestPayout(cents);
      setPayoutMsg(t('profilePage.payoutRequested', { amount: (cents / 100).toFixed(2), balance: ((res.newBalance || 0) / 100).toFixed(2) }));
      setWallet((w) => (w ? { ...w, balanceCents: res.newBalance } : null));
      setPayouts((p) => [res.payout, ...(p || [])]);
      setPayoutAmt('');
    } catch (e) {
      setPayoutMsg(e.message || t('profilePage.payoutFailed', 'Payout failed'));
    }
    setPayoutBusy(false);
  };

  if (!user) return null;

  return (
    <>
      <SEO title={t('wallet.title', 'Wallet')} description={t('wallet.desc', 'Your balance and payouts')} path="/wallet" />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-[var(--text)] mb-6">{t('wallet.title', 'Wallet')}</h1>

        <OperationalStubBanner features={['payments', 'payouts', 'kyc']} className="mb-4" />

        {error && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-6">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-1">
            {t('wallet.deploymentStatus', 'Money & identity on this deployment')}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mb-2">
            {t('wallet.deploymentStatusDesc', 'Honest status from the API — not marketing copy.')}
          </p>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3">
            <TrustLabeledBadge label={t('wallet.trustPayments', 'Payments')} feature="payments" />
            <TrustLabeledBadge label={t('wallet.trustPayouts', 'Payouts')} feature="payouts" />
            <TrustLabeledBadge label={t('wallet.trustKyc', 'KYC')} feature="kyc" />
          </div>
          {(kycTruth === 'DISABLED' || kycTruth === 'BETA' || kycTruth === 'UNKNOWN' || kycTruth === 'ERROR') && (
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
              {t(
                'wallet.kycDeploymentNote',
                'Payouts require identity verification when KYC is live on this deployment. The server still enforces checks even if the badge above is not LIVE.'
              )}
            </p>
          )}
        </section>

        {!loading && payoutRequirements && Array.isArray(payoutRequirements.requirements) && payoutRequirements.requirements.length > 0 && (
          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 mb-6">
            <h2 className="text-sm font-semibold text-[var(--text)] mb-1">
              {t('wallet.payoutEligibility', 'Payout eligibility')}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              {t(
                'wallet.payoutEligibilityDesc',
                'Creator payouts are blocked until these items are satisfied (API-enforced).'
              )}
            </p>
            <ul className="text-sm text-[var(--text)] space-y-1 mb-3">
              {payoutRequirements.requirements.map((r) => (
                <li key={r.id} className="flex gap-2">
                  <span className={r.done ? 'text-emerald-600' : 'text-[var(--text-muted)]'}>{r.done ? '✓' : '○'}</span>
                  <span>{r.label}</span>
                </li>
              ))}
            </ul>
            {!payoutRequirements.payoutReady && (
              <p className="text-xs text-[var(--text-muted)]">
                {t('wallet.completeCreatorSetup', 'Complete creator onboarding and verification:')}{' '}
                <Link to="/creator-apply" className="text-[var(--accent)] font-medium hover:underline">
                  {t('wallet.creatorApply', 'Creator apply')}
                </Link>
                .
              </p>
            )}
          </section>
        )}

        {loading ? (
          <div className="h-32 rounded-xl bg-[var(--bg-card)] animate-pulse" />
        ) : (
          <div className="space-y-6">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
              <p className="text-sm text-[var(--text-muted)]">{t('profilePage.availableBalance', 'Available balance')}</p>
              <p className="text-3xl font-extrabold text-amber-500 mt-1">
                {fmtCents(wallet?.balanceCents ?? 0)}
              </p>
              <div className="flex gap-3 mt-4">
                <Link to="/coins" className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-sm font-semibold hover:bg-amber-500/15 transition-colors">
                  {t('profilePage.buyCoins', 'Buy Coins')}
                </Link>
                <Link to="/profile" className="px-4 py-2 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-card)] transition-colors">
                  {t('wallet.viewProfile', 'View Profile')}
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
              <h2 className="text-base font-semibold text-[var(--text)] mb-4">{t('profilePage.requestPayout', 'Request payout')}</h2>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm">$</span>
                  <input
                    type="number"
                    min="5"
                    step="0.01"
                    placeholder="5.00"
                    value={payoutAmt}
                    onChange={(e) => setPayoutAmt(e.target.value)}
                    className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleRequestPayout}
                  disabled={payoutBusy || !payoutAmt}
                  className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  {payoutBusy ? '…' : t('profilePage.request', 'Request')}
                </button>
              </div>
              {payoutMsg && (
                <p className={`text-sm mt-2 ${payoutMsg.includes('failed') || payoutMsg.includes('Minimum') ? 'text-red-500' : 'text-emerald-500'}`}>
                  {payoutMsg}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
              <h2 className="text-base font-semibold text-[var(--text)] mb-4">{t('wallet.recentPayouts', 'Recent payouts')}</h2>
              {(!payouts || payouts.length === 0) ? (
                <p className="text-sm text-[var(--text-muted)]">{t('wallet.noPayouts', 'No payouts yet')}</p>
              ) : (
                <ul className="space-y-2">
                  {payouts.slice(0, 10).map((p) => (
                    <li key={p._id || p.id} className="flex justify-between items-center py-2 border-b border-[var(--border)] last:border-0">
                      <span className="text-sm text-[var(--text)]">
                        {p.status || 'pending'} · {new Date(p.createdAt || p.requestedAt).toLocaleDateString()}
                      </span>
                      <span className="text-sm font-medium text-[var(--text)]">{fmtCents(p.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
