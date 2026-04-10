/**
 * PricingPage — subscription tiers with regional pricing.
 * Prices auto-adjust for the user's country and display in local currency.
 * https://milloapp.com
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import TrustBadge from '../components/TrustBadge';
import { OperationalStubBanner } from '../components/OperationalStubBanner';
import { usePricing, formatLocalPrice, formatPrice } from '../sdk/pricingApi';

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

const TIER_STYLES = {
  free:    { border: 'border-[var(--border)]',    button: 'bg-[var(--bg-elevated)] text-[var(--text)] hover:bg-[var(--bg-tertiary,var(--bg-secondary))] border border-[var(--border)]' },
  creator: { border: 'border-[var(--accent)]',    button: 'bg-[var(--accent)] text-white hover:opacity-90', ring: 'ring-2 ring-[var(--accent)]/40' },
  pro:     { border: 'border-[var(--accent)]',    button: 'bg-[var(--accent)] text-white hover:opacity-90' },
};

const REGION_TIER_COLORS = {
  A: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  B: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  C: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  D: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

const COMPARE_ROW_KEYS = [
  { key: 'watchLive',     free: true,  creator: true,    pro: true  },
  { key: 'followCreators',free: '500', creator: '∞',     pro: '∞'   },
  { key: 'sendGifts',     free: false, creator: true,    pro: true  },
  { key: 'goLive',        free: false, creator: true,    pro: true  },
  { key: 'storefront',    free: false, creator: true,    pro: true  },
  { key: 'sellProducts',  free: false, creator: true,    pro: true  },
  { key: 'analytics',     free: false, creator: 'basicAnalytics', pro: 'advancedAnalytics' },
  { key: 'verifiedBadge', free: false, creator: false,   pro: true  },
  { key: 'prioritySupport',free:false, creator: false,   pro: 'slaSla' },
  { key: 'revenueBoost',  free: false, creator: false,   pro: 'boostPct' },
  { key: 'multiStream',   free: false, creator: false,   pro: true  },
  { key: 'customDomain',  free: false, creator: false,   pro: true  },
];

function CellValue({ val, t }) {
  if (val === true)  return <CheckIcon />;
  if (!val)          return <span className="text-[var(--text-muted)] opacity-40 text-base leading-none">—</span>;
  // named value keys get translated; raw cell strings (like '500', '∞') are passed through
  const label = val === 'basicAnalytics'  ? t('pricing.basicAnalytics')
              : val === 'advancedAnalytics'? t('pricing.advancedAnalytics')
              : val === 'slaSla'           ? t('pricing.slaSla')
              : val === 'boostPct'         ? t('pricing.boostPct')
              : val;
  return <span className="text-xs font-medium text-[var(--text-muted)]">{label}</span>;
}

export function PricingPage() {
  const { t } = useTranslation();
  const { config, region, loading } = usePricing();
  const [annual, setAnnual] = useState(false);

  const tiers   = config.subscriptionTiers;
  const tierKey = region?.tier ?? 'A';

  function getLocalPrice(tier) {
    if (!tier.priceMonthly) return 'Free';
    const cents = annual
      ? (tier.localPriceAnnual  ?? tier.priceAnnual)
      : (tier.localPriceMonthly ?? tier.priceMonthly);
    const currency = tier.localCurrency || region?.currency || 'USD';
    if (tier.localFormatted || tier.localFormattedMonthly) {
      return annual
        ? (tier.localFormattedAnnual  || formatLocalPrice(cents, currency))
        : (tier.localFormattedMonthly || formatLocalPrice(cents, currency));
    }
    return formatLocalPrice(cents, currency);
  }

  function getUsdEquiv(tier) {
    if (!tier.localCurrency || tier.localCurrency === 'USD') return null;
    const cents = annual ? tier.priceAnnual : tier.priceMonthly;
    return formatPrice(cents) + ' USD';
  }

  function getSavingPct(tier) {
    if (!tier.priceMonthly) return null;
    const annualMonthly = (tier.localPriceAnnual ?? tier.priceAnnual) / 12;
    const monthly       = tier.localPriceMonthly ?? tier.priceMonthly;
    return Math.round(100 - (annualMonthly / monthly) * 100);
  }

  return (
    <>
    <SEO title={t('pricing.seoTitle')} description={t('pricing.seoDesc')} path="/pricing" />
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text)]">

      {/* ── Hero ── */}
      <div className="border-b border-[var(--border)] bg-[var(--bg-elevated)]">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <div className="inline-flex items-center gap-2 bg-[var(--accent)]/15 border border-[var(--accent)]/30 rounded-full px-4 py-1.5 text-[var(--accent)] text-sm font-medium mb-4">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            {t('pricing.badge')}
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3">
            {t('pricing.title')}
          </h1>
          <p className="text-[var(--text-muted)] text-lg max-w-xl mx-auto">
            {t('pricing.subtitle')}
          </p>

          {/* Region badge */}
          {!loading && region && (
            <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${REGION_TIER_COLORS[tierKey] ?? REGION_TIER_COLORS.A}`}>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {t('pricing.regionPricing', { country: region.country, tierLabel: region.tierLabel })}
                {region.multiplier < 1 && (
                  <span className="ml-1 text-emerald-400 font-bold">
                    {t('pricing.regionDiscount', { pct: Math.round((1 - region.multiplier) * 100) })}
                  </span>
                )}
              </div>
              {region.currency !== 'USD' && (
                <span className="text-xs text-[var(--text-muted)]">{t('pricing.pricesIn', { currency: region.currency })}</span>
              )}
            </div>
          )}

          {/* Billing toggle */}
          <div className="mt-7 inline-flex items-center gap-3 bg-[var(--bg-primary)] border border-[var(--border)] rounded-full p-1">
            <button
              onClick={() => setAnnual(false)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${!annual ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
            >
              {t('pricing.monthly')}
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${annual ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
            >
              {t('pricing.annual')}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${annual ? 'bg-white/20 text-white' : 'bg-emerald-500/20 text-emerald-400'}`}>
                {t('pricing.saveUpTo')}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Plan cards ── */}
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="flex flex-wrap items-center gap-2 mb-4 text-xs text-[var(--text-muted)]">
          <span>{t('checkout.paymentsRail', 'Payments')}</span>
          <TrustBadge feature="payments" />
        </div>
        <OperationalStubBanner features={['payments', 'email', 'push']} className="mb-8" />
        {loading ? (
          <div className="grid sm:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => <div key={i} className="h-96 rounded-2xl bg-[var(--bg-elevated)] animate-pulse" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-6">
            {tiers.map((tier) => {
              const style   = TIER_STYLES[tier.id] ?? TIER_STYLES.free;
              const saving  = annual ? getSavingPct(tier) : null;
              const usdEq   = annual ? null : getUsdEquiv(tier);
              return (
                <div
                  key={tier.id}
                  className={`relative flex flex-col rounded-2xl border-2 bg-[var(--bg-elevated)] p-6 transition-transform hover:-translate-y-0.5 ${style.border} ${style.ring ?? ''}`}
                >
                  {tier.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-bold bg-[var(--accent)] text-white shadow">
                      {tier.badge}
                    </div>
                  )}

                  <div className="mb-5">
                    <h2 className="text-lg font-bold">{tier.name}</h2>
                    <div className="mt-3 flex items-end gap-1">
                      <span className="text-4xl font-extrabold leading-none">{getLocalPrice(tier)}</span>
                      {tier.priceMonthly > 0 && (
                        <span className="text-sm text-[var(--text-muted)] mb-0.5">{annual ? t('pricing.perYear') : t('pricing.perMonth')}</span>
                      )}
                    </div>
                    {/* USD equivalent */}
                    {usdEq && (
                      <div className="mt-0.5 text-xs text-[var(--text-muted)] opacity-60">{usdEq}</div>
                    )}
                    {/* Annual saving */}
                    {saving && (
                      <div className="mt-1 text-xs text-emerald-400 font-medium">{t('pricing.save', { pct: saving })}</div>
                    )}
                  </div>

                  <ul className="space-y-2.5 flex-1 mb-6">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
                        <CheckIcon />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <Link
                    to="/login"
                    className={`w-full text-center py-2.5 rounded-xl font-semibold text-sm transition-opacity ${style.button}`}
                  >
                    {tier.priceMonthly === 0 ? t('pricing.getStartedFree') : t('pricing.getTier', { name: tier.name })}
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Regional discount banner ── */}
        {!loading && region?.multiplier < 1 && (
          <div className="mt-8 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex gap-3 text-sm">
            <svg className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
            <div>
              <span className="font-semibold text-emerald-400">{t('pricing.regionalBanner', { pct: Math.round((1 - region.multiplier) * 100) })}</span>
              <span className="text-[var(--text-muted)] ml-2">
                {t('pricing.regionalDesc', { country: region.country, tierLabel: region.tierLabel, description: region.description })}
              </span>
            </div>
          </div>
        )}

        {/* ── Feature comparison table ── */}
        <section className="mt-20">
          <h2 className="text-xl font-bold mb-6 text-center">{t('pricing.compareTitle')}</h2>
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-elevated)]">
                  <th className="px-5 py-3.5 text-left font-semibold text-[var(--text-muted)]">{t('pricing.featureCol')}</th>
                  {tiers.map((t) => (
                    <th key={t.id} className={`px-4 py-3.5 text-center font-semibold ${t.highlight ? 'text-[var(--accent)]' : 'text-[var(--text)]'}`}>
                      {t.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROW_KEYS.map(({ key, free, creator, pro }, i) => (
                  <tr key={key} className={`border-b border-[var(--border)] ${i % 2 === 0 ? 'bg-[var(--bg-primary)]' : 'bg-[var(--bg-elevated)]/40'}`}>
                    <td className="px-5 py-3 text-[var(--text-muted)]">{t(`pricing.rows.${key}`)}</td>
                    <td className="px-4 py-3 text-center"><div className="flex justify-center"><CellValue val={free} t={t} /></div></td>
                    <td className="px-4 py-3 text-center"><div className="flex justify-center"><CellValue val={creator} t={t} /></div></td>
                    <td className="px-4 py-3 text-center"><div className="flex justify-center"><CellValue val={pro} t={t} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Coin store CTA ── */}
        <section className="mt-16 p-8 rounded-2xl bg-[var(--accent-premium-subtle)] border border-[var(--accent-premium)]/40 text-center">
          <div className="text-2xl font-bold mb-2">{t('pricing.needCoins')}</div>
          <p className="text-[var(--text-muted)] mb-5">
            {t('pricing.needCoinsDesc')}
          </p>
          <Link to="/coins" className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-semibold px-6 py-2.5 rounded-xl transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t('pricing.buyCoins')}
          </Link>
        </section>
      </div>
    </div>
    </>
  );
}
