/**
 * CoinStorePage — buy coin packs with regional pricing.
 * Prices are auto-adjusted for the user's country and displayed in local currency.
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import TrustBadge from '../components/TrustBadge';
import { OperationalStubBanner } from '../components/OperationalStubBanner';
import { usePricing, formatLocalPrice, formatCents } from '../sdk/pricingApi';
import { createCoinCheckoutSession } from '../sdk/contentApi';
import { getUser } from '../sdk/authApi';
import { getDeviceFingerprint } from '../lib/deviceFingerprint';

/* ── Coin SVG icon ── */
function CoinSvg({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`text-[var(--accent-premium)] ${className}`} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="bold" fill="currentColor" opacity="0.9">M</text>
    </svg>
  );
}

/* ── Tier badge styles ── */
const PACK_STYLES = {
  starter: { border: 'border-[var(--border-strong)]', badge: 'bg-[var(--bg-card)] text-[var(--text-secondary)]', glow: '' },
  basic:   { border: 'border-[var(--border)]', badge: 'bg-[var(--bg-elevated)] text-[var(--text)]', glow: '' },
  popular: { border: 'border-[var(--accent-premium)]', badge: 'bg-[var(--accent-premium)] text-white', glow: 'shadow-md' },
  pro:     { border: 'border-[var(--accent)]', badge: 'bg-[var(--accent)] text-white', glow: 'shadow-md' },
  mega:    { border: 'border-[var(--accent)]', badge: 'bg-[var(--accent)] text-white', glow: 'shadow-md' },
  ultra:   { border: 'border-[var(--accent)]', badge: 'bg-[var(--accent)] text-white', glow: 'shadow-lg' },
};

/* ── Region tier badge colours ── */
const TIER_COLORS = {
  A: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  B: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  C: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  D: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};


export function CoinStorePage() {
  const { t } = useTranslation();
  const { config, region, loading, country } = usePricing();
  const [searchParams]              = useSearchParams();
  const [selected,   setSelected]   = useState(null);
  const [purchasing, setPurchasing] = useState(false);
  const [success,    setSuccess]    = useState(null);
  const [openFaq,    setOpenFaq]    = useState(null);
  const [buyError,   setBuyError]   = useState(null);
  const [stubPaymentsNotice, setStubPaymentsNotice] = useState(false);

  // Handle redirect back from Stripe Checkout
  useEffect(() => {
    const pack  = searchParams.get('pack');
    const coins = searchParams.get('coins');
    if (pack && coins) {
      setSuccess({ id: pack, coins: Number(coins), bonusCoins: 0 });
      setTimeout(() => setSuccess(null), 6000);
    }
  }, [searchParams]);

  const packs    = config.coinPacks;
  const currency = region?.currency ?? 'USD';
  const tierKey  = region?.tier ?? 'A';
  const user     = getUser();

  async function handleBuy(pack) {
    if (!user) { window.location.href = '/login'; return; }
    setBuyError(null);
    setSelected(pack.id);
    setPurchasing(true);
    try {
      const fingerprint = await getDeviceFingerprint();
      const res = await createCoinCheckoutSession(pack.id, country, fingerprint || undefined);
      if (res.stub) {
        setStubPaymentsNotice(true);
        // Stub/dev mode — coins already credited
        setSuccess({ ...pack, coins: pack.coins + (pack.bonusCoins || 0), bonusCoins: 0 });
        setTimeout(() => setSuccess(null), 5000);
      } else if (res.redirectUrl) {
        window.location.href = res.redirectUrl;
      } else {
        setBuyError('Could not start checkout. Please try again.');
      }
    } catch (e) {
      setBuyError(e.message || 'Purchase failed. Please try again.');
    }
    setPurchasing(false);
    setSelected(null);
  }

  /* Display price: prefer localFormatted (regional), fallback to USD */
  function displayPrice(pack) {
    if (pack.localFormatted) return pack.localFormatted;
    return formatLocalPrice(pack.priceCents, 'USD');
  }

  /* USD equivalent shown as sub-label when showing a non-USD currency */
  function usdEquiv(pack) {
    if (!pack.localCurrency || pack.localCurrency === 'USD') return null;
    return formatCents(pack.priceCents);
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <SEO
        title={t('coinStore.seoTitle')}
        description={t('coinStore.seoDesc')}
        path="/coins"
      />

      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-[var(--bg-elevated)] border-b border-[var(--border)]">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {[...Array(18)].map((_, i) => (
            <CoinSvg key={i} size={14 + (i % 4) * 8} className="absolute opacity-[0.06]"
              style={{ top: `${10 + (i * 17) % 80}%`, left: `${(i * 13) % 95}%` }} />
          ))}
        </div>
        <div className="relative max-w-4xl mx-auto px-4 py-16 text-center">
          <div className="inline-flex items-center gap-2 bg-[var(--accent-premium-subtle)] border border-[var(--accent-premium)]/40 rounded-full px-4 py-1.5 text-[var(--accent-premium)] text-sm font-medium mb-4">
            <CoinSvg size={16} />
            {t('nav.coins')}
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3">
            {t('pricing.needCoins')}
          </h1>
          <p className="text-[var(--text-secondary)] text-lg max-w-xl mx-auto">
            {t('pricing.needCoinsDesc')}
          </p>

          <div className="mt-4 flex items-center justify-center gap-2 flex-wrap text-sm text-[var(--text-muted)]">
            <span>{t('coinStore.paymentsStatus', 'Payments')}</span>
            <TrustBadge feature="payments" />
          </div>

          {/* Region badge */}
          {!loading && region && (
            <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${TIER_COLORS[tierKey] ?? TIER_COLORS.A}`}>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {region.country} — {region.tierLabel} pricing
                {region.multiplier < 1 && (
                  <span className="ml-1 text-emerald-400 font-bold">
                    ({Math.round((1 - region.multiplier) * 100)}% off)
                  </span>
                )}
              </div>
              <span className="text-xs text-[var(--text-secondary)]">{t('pricing.pricesIn', { currency })}</span>
            </div>
          )}

          <div className="mt-5 inline-flex items-center gap-6 text-sm text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              {t('coinStore.instantDelivery')}
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              {t('coinStore.neverExpire')}
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              {t('coinStore.regionalPricing')}
            </span>
          </div>
        </div>
      </div>

      {/* ── Success toast ── */}
      {success && (
        <div className="fixed top-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-2 max-w-xs">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          <span>{t('coinStore.coinsAdded', { count: (success.coins || 0) + (success.bonusCoins || 0) })}</span>
        </div>
      )}
      {/* ── Error toast ── */}
      {buyError && (
        <div className="fixed top-6 right-6 z-50 bg-red-600 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-2 max-w-xs">
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          <span>{buyError}</span>
          <button type="button" onClick={() => setBuyError(null)} className="ml-1 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}

      {stubPaymentsNotice ? (
        <div className="max-w-5xl mx-auto px-4 pt-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100 px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>Demo / stub payments.</strong> Checkout completed without a live processor — coins were credited in development mode only.
            </span>
            <button
              type="button"
              className="text-xs font-semibold underline opacity-90 hover:opacity-100 shrink-0"
              onClick={() => setStubPaymentsNotice(false)}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Coin packs grid ── */}
      <div className="max-w-5xl mx-auto px-4 py-12">
        <OperationalStubBanner features={['payments']} className="mb-6" />
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-52 rounded-2xl bg-[var(--bg-elevated)] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {packs.map((pack) => {
              const style      = PACK_STYLES[pack.id] ?? PACK_STYLES.basic;
              const totalCoins = pack.coins + pack.bonusCoins;
              const isSelected = selected === pack.id && purchasing;
              const equiv      = usdEquiv(pack);
              return (
                <button
                  key={pack.id}
                  onClick={() => handleBuy(pack)}
                  disabled={purchasing}
                  className={`
                    relative group flex flex-col items-center rounded-2xl border-2 p-4 transition-all duration-200
                    bg-[var(--bg-elevated)] hover:bg-[var(--bg-card)]
                    hover:-translate-y-0.5 active:scale-95 focus:outline-none
                    ${style.border} ${style.glow} ${isSelected ? 'opacity-70' : ''}
                  `}
                >
                  {pack.popular && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-amber-500 text-white shadow">
                      {t('coinStore.bestDeal')}
                    </div>
                  )}

                  <div className="relative mt-1 mb-3">
                    <CoinSvg size={44} />
                    {pack.bonusCoins > 0 && (
                      <div className="absolute -right-1 -bottom-1 bg-emerald-500 text-white text-[9px] font-bold px-1 rounded-full leading-4">
                        +{pack.bonusCoins}
                      </div>
                    )}
                  </div>

                  <div className="text-xl font-extrabold leading-none text-[var(--text)]">
                    {totalCoins.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 mb-3">
                    {pack.bonusCoins > 0
                      ? t('coinStore.bonus', { coins: pack.coins.toLocaleString(), bonus: pack.bonusCoins })
                      : t('coinStore.coins')}
                  </div>

                  <div className={`w-full text-center text-sm font-bold py-1.5 rounded-lg ${style.badge}`}>
                    {isSelected ? (
                      <span className="inline-flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582M20 20v-5h-.581M4.582 9A8 8 0 0120 15M19.418 15A8 8 0 014 9" />
                        </svg>
                        {t('coinStore.processing')}
                      </span>
                    ) : (
                      displayPrice(pack)
                    )}
                  </div>
                  {/* USD equivalent for non-USD regions */}
                  {equiv && !isSelected && (
                    <div className="text-[10px] text-[var(--text-secondary)] mt-1 opacity-60">{equiv} USD</div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Value comparison banner ── */}
        <div className="mt-8 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-wrap items-center gap-4 text-sm">
          <CoinSvg size={22} />
          <div>
            <span className="font-semibold text-amber-400">{t('coinStore.exchangeRateLabel')}</span>
            <span className="text-[var(--text-secondary)] ml-2">{t('coinStore.exchangeRateValue')}</span>
          </div>
          <div className="h-4 w-px bg-amber-500/30 hidden sm:block" />
          <div>
            <span className="font-semibold text-emerald-400">{t('coinStore.ultraPackSavings')}</span>
            <span className="text-[var(--text-secondary)] ml-2">{t('coinStore.vsStarterRate')}</span>
          </div>
          <div className="h-4 w-px bg-amber-500/30 hidden sm:block" />
          <Link to="/pricing" className="text-[var(--accent)] hover:underline font-medium">
            {t('coinStore.viewPlans')}
          </Link>
        </div>

        {/* ── Regional pricing explainer ── */}
        {region?.multiplier < 1 && (
          <div className="mt-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex gap-3 text-sm">
            <svg className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
            <div>
              <span className="font-semibold text-emerald-400">{t('coinStore.regionalApplied')}</span>
              <span className="text-[var(--text-secondary)] ml-2">
                {t('coinStore.regionalDesc', {
                  country: region.country,
                  tier: region.tierLabel,
                  discount: Math.round((1 - region.multiplier) * 100),
                })}
              </span>
            </div>
          </div>
        )}

        {/* ── How it works ── */}
        <section className="mt-16">
          <h2 className="text-xl font-bold mb-6">{t('coinStore.howItWorks')}</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              {
                icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h18M7 15h.01M11 15h.01M9 7V3m6 4V3" /></svg>,
                title: t('coinStore.step1Title'),
                desc: t('coinStore.step1Desc'),
              },
              {
                icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>,
                title: t('coinStore.step2Title'),
                desc: t('coinStore.step2Desc'),
              },
              {
                icon: <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>,
                title: t('coinStore.step3Title'),
                desc: t('coinStore.step3Desc'),
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="flex gap-4 p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border)]">
                <div className="shrink-0 w-11 h-11 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center">
                  {icon}
                </div>
                <div>
                  <div className="font-semibold mb-1">{title}</div>
                  <div className="text-sm text-[var(--text-secondary)] leading-relaxed">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="mt-16">
          <h2 className="text-xl font-bold mb-6">{t('coinStore.faqTitle')}</h2>
          <div className="space-y-2">
            {[1,2,3,4,5,6].map((n, i) => (
              <div key={n} className="rounded-xl border border-[var(--border)] overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left bg-[var(--bg-elevated)] hover:bg-[var(--bg-card)] transition-colors"
                >
                  <span className="font-medium text-sm">{t(`coinStore.faq${n}Q`)}</span>
                  <svg className={`w-4 h-4 text-[var(--text-secondary)] transition-transform ${openFaq === i ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-5 py-4 text-sm text-[var(--text-secondary)] bg-[var(--bg)] border-t border-[var(--border)] leading-relaxed">
                    {t(`coinStore.faq${n}A`)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
