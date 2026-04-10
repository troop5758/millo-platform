/**
 * SubscribePage — subscribe to a creator using coins.
 * Route: /subscribe/:creatorId
 * Uses POST /payments/subscriptions/creator
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import TrustBadge from '../components/TrustBadge';
import { OperationalStubBanner } from '../components/OperationalStubBanner';
import { getUser } from '../sdk/authApi';
import {
  fetchCreator, fetchSubscriptionStatus, fetchWallet,
  subscribeToCreator, cancelSubscription,
} from '../sdk/contentApi';
import { fetchPricingConfig } from '../sdk/pricingApi';

function fmtCents(c) {
  return c == null ? '—' : `${c} coins`;
}

const PERK_KEYS = [
  { icon: '⭐', key: 'subscribe.perks.badge' },
  { icon: '🔒', key: 'subscribe.perks.exclusiveContent' },
  { icon: '💬', key: 'subscribe.perks.chatPriority' },
  { icon: '🎁', key: 'subscribe.perks.rewards' },
  { icon: '📡', key: 'subscribe.perks.earlyAccess' },
];

export function SubscribePage() {
  const { t }         = useTranslation();
  const { creatorId } = useParams();
  const navigate      = useNavigate();
  const me            = getUser();

  const [profile,    setProfile]    = useState(null);
  const [subStatus,  setSubStatus]  = useState(null); // { subscribed, subscription }
  const [wallet,     setWallet]     = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [subBusy,    setSubBusy]    = useState(false);
  const [error,      setError]      = useState(null);
  const [success,    setSuccess]    = useState(false);

  useEffect(() => {
    if (!me) navigate('/login', { replace: true });
  }, [me, navigate]);

  const [priceCents, setPriceCents] = useState(null); // null = loading

  const load = useCallback(async () => {
    setLoading(true);
    const [profileRes, subRes, walletRes, pricingRes] = await Promise.allSettled([
      fetchCreator(creatorId),
      fetchSubscriptionStatus(creatorId),
      fetchWallet(),
      fetchPricingConfig(),
    ]);
    if (profileRes.status === 'fulfilled') setProfile(profileRes.value);
    if (subRes.status    === 'fulfilled') setSubStatus(subRes.value);
    if (walletRes.status === 'fulfilled') setWallet(walletRes.value);
    if (pricingRes.status === 'fulfilled') {
      const cfg = pricingRes.value?.config;
      const price = cfg?.creatorSubPriceCents
        ?? cfg?.subscriptionTiers?.[0]?.priceCents
        ?? 500;
      setPriceCents(price);
    } else {
      setPriceCents(500);
    }
    setLoading(false);
  }, [creatorId]);

  useEffect(() => { if (me) load(); }, [me, load]);

  const handleSubscribe = async () => {
    if (!me) { navigate('/login'); return; }
    setSubBusy(true);
    setError(null);
    try {
      const data = await subscribeToCreator(creatorId);
      setSubStatus({ subscribed: true, subscription: data.subscription });
      setSuccess(true);
      fetchWallet().then((w) => setWallet(w)).catch(() => null);
    } catch (e) {
      const msg = e.message;
      if (msg === 'INSUFFICIENT_COINS') setError(t('subscribe.insufficientCoins'));
      else if (msg === 'ALREADY_SUBSCRIBED') { setSubStatus((prev) => ({ ...prev, subscribed: true })); }
      else setError(msg);
    }
    setSubBusy(false);
  };

  const handleCancel = async () => {
    if (!subStatus?.subscription?._id) return;
    setSubBusy(true);
    setError(null);
    try {
      await cancelSubscription(subStatus.subscription._id);
      setSubStatus({ subscribed: false, subscription: null });
    } catch (e) {
      setError(e.message);
    }
    setSubBusy(false);
  };

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 flex justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center text-[var(--text-muted)]">
        {t('subscribe.creatorNotFound')}{' '}
        <Link to="/" className="text-[var(--accent)] hover:underline">{t('subscribe.goHome')}</Link>
      </div>
    );
  }

  const displayName = profile.displayName || profile.username || 'Creator';
  const SUB_PRICE   = priceCents ?? 500; // from platform settings API

  if (success) {
    return (
      <>
        <SEO title={`Subscribed to ${displayName} — Millo`} path={`/subscribe/${creatorId}`} />
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-5">
            <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)] mb-2">{t('subscribe.success')}</h1>
          <p className="text-[var(--text-muted)] mb-6">
            {t('subscribe.successDesc', { name: displayName })}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to={`/creator/${creatorId}`}
              className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-hover)] transition-colors">
              {t('subscribe.viewProfile')}
            </Link>
            <Link to="/feed"
              className="px-5 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors">
              {t('subscribe.browseFeed')}
            </Link>
          </div>
        </div>
      </>
    );
  }

  const isSubscribed = subStatus?.subscribed;
  const subEndsAt    = subStatus?.subscription?.endsAt;
  const balance      = wallet?.balanceCents ?? 0;
  const canAfford    = balance >= SUB_PRICE;

  return (
    <>
      <SEO title={`Subscribe to ${displayName} — Millo`} description={`Subscribe to ${displayName} on Millo.`} path={`/subscribe/${creatorId}`} />
      <div className="max-w-lg mx-auto px-4 py-10">

        {/* Creator header */}
        <div className="flex items-center gap-4 mb-8">
          {profile.avatarUrl
            ? <img src={profile.avatarUrl} alt={displayName} className="w-16 h-16 rounded-full object-cover border-2 border-[var(--border)]" />
            : <div className="w-16 h-16 rounded-full bg-[var(--accent)]/10 flex items-center justify-center text-2xl font-bold text-[var(--accent)] border-2 border-[var(--border)]">
                {displayName[0].toUpperCase()}
              </div>}
          <div>
            <h1 className="text-xl font-bold text-[var(--text)]">{displayName}</h1>
            {profile.username && <p className="text-sm text-[var(--text-muted)]">@{profile.username}</p>}
            {(profile.followersCount || 0) > 0 && (
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{(profile.followersCount || 0).toLocaleString()} followers</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4 text-xs text-[var(--text-muted)]">
          <span>{t('subscribe.paymentsRail', 'Payments')}</span>
          <TrustBadge feature="payments" />
        </div>
        <OperationalStubBanner features={['payments', 'email', 'push']} className="mb-4" />

        {/* Subscription card */}
        <div className="rounded-2xl border-2 border-[var(--accent)]/40 bg-[var(--bg-card)] overflow-hidden mb-5">
          {/* Gradient header */}
          <div className="bg-[var(--accent)] px-6 py-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-wider opacity-80 mb-1">{t('subscribe.monthlyPlan')}</p>
            <p className="text-3xl font-extrabold">{fmtCents(SUB_PRICE)}</p>
            <p className="text-sm opacity-80 mt-0.5">{t('subscribe.perMonth')}</p>
          </div>

          {/* Perks */}
          <div className="px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-4">{t('subscribe.whatYouGet')}</p>
            <ul className="space-y-3">
              {PERK_KEYS.map(({ icon, key }) => (
                <li key={key} className="flex items-center gap-3">
                  <span className="text-lg">{icon}</span>
                  <span className="text-sm text-[var(--text)]">{t(key)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Wallet balance */}
        <div className="flex items-center justify-between mb-5 px-1">
          <span className="text-sm text-[var(--text-muted)]">{t('subscribe.balance')}</span>
          <span className={`text-sm font-bold ${canAfford ? 'text-emerald-500' : 'text-red-500'}`}>
            {balance.toLocaleString()} {t('subscribe.coins')}
          </span>
        </div>

        {/* Already subscribed */}
        {isSubscribed ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-emerald-600">{t('subscribe.active')}</p>
                {subEndsAt && (
                  <p className="text-xs text-emerald-600/80">{t('subscribe.renewsOn', { date: new Date(subEndsAt).toLocaleDateString() })}</p>
                )}
              </div>
            </div>
            <button type="button" onClick={handleCancel} disabled={subBusy}
              className="w-full py-3 rounded-xl border border-red-500/40 text-red-500 text-sm font-semibold hover:bg-red-500/5 transition-colors disabled:opacity-50">
              {subBusy ? t('subscribe.cancelling') : t('subscribe.cancelSubscription')}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {!canAfford && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <p className="text-sm text-amber-700">
                  {t('subscribe.needMoreCoins', { count: SUB_PRICE - balance })}{' '}
                  <Link to="/coins" className="font-semibold hover:underline">{t('subscribe.buyCoins')}</Link>
                </p>
              </div>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button type="button" onClick={handleSubscribe} disabled={subBusy || !canAfford}
              className="w-full py-3.5 rounded-xl bg-[var(--accent)] text-white font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2">
              {subBusy
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {t('subscribe.subscribing')}</>
                : t('subscribe.subscribeFor', { price: fmtCents(SUB_PRICE) })}
            </button>
          </div>
        )}

        <p className="text-xs text-center text-[var(--text-muted)] mt-4">
          {t('subscribe.termsNote')}{' '}
          <Link to="/terms" className="hover:underline">{t('subscribe.termsApply')}</Link>
        </p>
      </div>
    </>
  );
}
