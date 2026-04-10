import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { MilloCoin } from '../components/MilloCoin';
import { GIFTS } from '../components/GiftPanel';
import { useCart } from '../context/CartContext';
import { fetchCreatorProducts, fetchCreatorAuctions, fetchCreator, fetchWallet } from '../sdk/contentApi';

// All product/auction data is fetched from the API — no hardcoded fallbacks

export function ShopfrontPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const TABS = [
    { key: 'flashDeals',  label: t('shopfront.tabFlashDeals',  { defaultValue: 'Flash Deals' }) },
    { key: 'newArrivals', label: t('shopfront.tabNewArrivals', { defaultValue: 'New Arrivals' }) },
    { key: 'bestSellers', label: t('shopfront.tabBestSellers', { defaultValue: 'Best Sellers' }) },
    { key: 'gifts',       label: t('shopfront.tabGifts',       { defaultValue: 'Virtual Gifts' }) },
  ];
  const [tab,      setTab]      = useState('flashDeals');
  const { addItem } = useCart();
  const [added,    setAdded]    = useState(null);
  const [products, setProducts] = useState(null);  // null = loading, [] = empty
  const [auctions, setAuctions] = useState(null);
  const [profile,  setProfile]  = useState(null);
  const [balance,  setBalance]  = useState(null);  // user wallet balance in coins
  const [search,   setSearch]   = useState('');

  useEffect(() => {
    if (!id) return;
    fetchCreatorProducts(id)
      .then((p) => setProducts(Array.isArray(p) ? p : []))
      .catch(() => setProducts([]));
    fetchCreatorAuctions(id)
      .then((a) => setAuctions(Array.isArray(a) ? a : []))
      .catch(() => setAuctions([]));
    fetchCreator(id)
      .then((c) => setProfile(c))
      .catch(() => null);
    fetchWallet()
      .then((w) => setBalance(w?.balanceCents ?? null))
      .catch(() => null);
  }, [id]);

  const handleAdd = (product) => {
    addItem({
      id:         product._id || product.id,
      name:       product.name,
      priceCents: product.priceCents ?? 0,
      imageUrl:   (product.imageUrls?.[0]) || product.imageUrl || null,
    });
    setAdded(product._id || product.id);
    setTimeout(() => setAdded(null), 1200);
  };

  // products: null = loading, [] = empty, [...] = loaded
  const q = search.trim().toLowerCase();
  const liveProducts = products === null ? null : (q
    ? products.filter((p) => p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
    : products);
  const liveAuctions = auctions === null ? null : (q
    ? auctions.filter((a) => (a.title || a.name)?.toLowerCase().includes(q))
    : auctions);

  return (
    <>
      <SEO
        title={t('shopfront.seoTitle', { creator: id || t('shopfront.creator') })}
        description={t('shopfront.seoDesc')}
        path={'/creator/' + id + '/shop'}
        image={profile?.avatarUrl || undefined}
      />

      <div className="min-h-screen bg-[#f0f2f7]">
        {/* Shop toolbar only — global nav is Layout (MarketingSiteHeader or app header). */}
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[min(100%,18rem)] max-w-xl">
              <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                </svg>
                <input
                  type="search"
                  placeholder={t('shopfront.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none w-full"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
              <Link
                to={'/creator/' + id + '/auctions'}
                className="text-sm font-semibold text-blue-600 hover:underline"
              >
                {t('shopfront.navAuctions')}
              </Link>
              <Link
                to={'/creator/' + id}
                className="text-sm font-semibold text-slate-600 hover:text-slate-900"
              >
                {t('shopfront.navCreators')}
              </Link>
              <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5 text-sm font-semibold text-amber-700">
                <MilloCoin size={18} />
                {balance === null ? '—' : balance.toLocaleString()}
              </div>
              <button type="button" className="text-red-500 text-xl leading-none" aria-label="Wishlist">{'♥'}</button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
          {/* Main column */}
          <main className="flex-1 min-w-0 space-y-6">
            {/* Hero banner */}
            <div className="relative rounded-2xl overflow-hidden h-48 sm:h-56 flex items-center bg-[var(--accent)]">
              <div className="px-8 z-10">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white">{t('shopfront.heroTitle')}</h2>
                <p className="mt-2 inline-block bg-[var(--accent-premium)] text-white text-sm font-semibold px-3 py-1 rounded-full">
                  {t('shopfront.heroSubtitle')}
                </p>
                <div className="flex gap-3 mt-4">
                  <Link to={'/creator/' + id + '/auctions'}
                    className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold transition-colors">
                    {t('shopfront.heroLiveAuctions')}
                  </Link>
                  <button type="button"
                    onClick={() => {
                      setTab('flashDeals');
                      document.getElementById('shopfront-products')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="px-4 py-2 rounded-lg bg-[var(--bg-card)] text-[var(--text)] text-sm font-semibold border border-[var(--border)] hover:bg-[var(--bg-elevated)] transition-colors">
                    {t('shopfront.heroBuyNow')}
                  </button>
                </div>
              </div>
              <div className="absolute right-4 top-0 h-full flex items-center text-8xl opacity-20 pointer-events-none" aria-hidden>🛍</div>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {TABS.map((tb) => (
                <button key={tb.key} type="button" onClick={() => setTab(tb.key)}
                  className={'shrink-0 px-5 py-2 rounded-lg text-sm font-semibold transition-colors ' +
                    (tab === tb.key ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-card)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--bg-elevated)]')}>
                  {tb.label}
                </button>
              ))}
            </div>

            {/* Virtual Gifts tab */}
            {tab === 'gifts' && (
              <section>
                <div className="mb-4">
                  <h3 className="font-bold text-slate-800 text-base">{t('shopfront.tabGifts')}</h3>
                  <p className="text-sm text-slate-500 mt-0.5">{t('shop.giftsSubtitle')}</p>
                </div>
                {/* Tier legend */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {[
                    { key: 'common',    color: 'bg-slate-100 text-slate-600 border border-slate-200' },
                    { key: 'rare',      color: 'bg-blue-50 text-blue-700 border border-blue-200' },
                    { key: 'epic',      color: 'bg-purple-50 text-purple-700 border border-purple-200' },
                    { key: 'legendary', color: 'bg-amber-50 text-amber-700 border border-amber-200' },
                  ].map((tier) => (
                    <span key={tier.key} className={'text-xs font-semibold px-2.5 py-1 rounded-full ' + tier.color}>{t(`shopfront.tier${tier.key.charAt(0).toUpperCase() + tier.key.slice(1)}`)}</span>
                  ))}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                  {GIFTS.map((gift) => {
                    const tierStyles = {
                      common:    'bg-slate-50 border-slate-200',
                      rare:      'bg-blue-50 border-blue-200',
                      epic:      'bg-purple-50 border-purple-200',
                      legendary: 'bg-amber-50 border-amber-200',
                    };
                    const coinStyles = {
                      common:    'text-slate-600',
                      rare:      'text-blue-600',
                      epic:      'text-purple-600',
                      legendary: 'text-amber-600',
                    };
                    return (
                      <div key={gift.id}
                        className={'flex flex-col items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all hover:scale-105 hover:shadow-md ' + tierStyles[gift.tier]}>
                        <div className="relative">
                          {gift.tier === 'legendary' && (
                            <div className="absolute -inset-1 rounded-full bg-[var(--accent-premium)]/30 blur-sm pointer-events-none" />
                          )}
                          <gift.Svg className="w-14 h-14 drop-shadow" />
                        </div>
                        <span className="text-xs font-semibold text-slate-800 text-center leading-tight">{gift.name}</span>
                        <span className={'flex items-center gap-0.5 text-xs font-bold ' + coinStyles[gift.tier]}>
                          <MilloCoin size={12} /> {gift.coins >= 1000 ? (gift.coins / 1000).toFixed(gift.coins % 1000 ? 1 : 0) + 'K' : gift.coins}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Live Auctions (hidden on Virtual Gifts tab) */}
            {tab !== 'gifts' && (
            <>
            <section>
              <h3 className="flex items-center gap-2 font-bold text-slate-800 mb-3">
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" aria-hidden />
                {t('shopfront.sectionLiveAuctions')}
              </h3>
              {liveAuctions === null
                ? <div className="h-16 flex items-center text-slate-400 text-sm"><span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2" />{t('shopfront.loadingAuctions')}</div>
                : liveAuctions.length === 0 ? (
                  <div className="h-20 flex flex-col items-center justify-center text-slate-400 text-sm gap-1">
                    <span className="text-2xl">🔨</span>
                    <span>{t('shopfront.noAuctions')}</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {liveAuctions.map((a) => {
                      const aid = a._id || a.id;
                      const endsAt = a.endsAt ? new Date(a.endsAt) : null;
                      const msLeft = endsAt ? Math.max(0, endsAt - Date.now()) : null;
                      const timer = msLeft != null ? (msLeft > 3600000 ? `${Math.floor(msLeft / 3600000)}h` : `${Math.floor(msLeft / 60000)}m`) : (a.timer || null);
                      const isLive = a.status === 'live' || a.live;
                      const bid = a.currentBidCents != null ? '$' + (a.currentBidCents / 100).toFixed(2) : (a.startBidCents != null ? '$' + (a.startBidCents / 100).toFixed(2) : a.bid);
                      return (
                        <Link key={aid} to={`/creator/${id}/auctions${aid ? `?auction=${aid}` : ''}`}
                          className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow block">
                          <div className="relative aspect-video bg-slate-100 flex items-center justify-center text-4xl overflow-hidden">
                            {a.imageUrl ? <img src={a.imageUrl} alt={a.title || a.name} className="w-full h-full object-cover" /> : <span aria-hidden>🛍</span>}
                            {timer && (
                              <span className="absolute top-2 left-2 bg-black/60 text-white text-xs font-bold px-2 py-0.5 rounded">
                                {timer} {t('shopfront.timeLeft')}
                              </span>
                            )}
                            {isLive && (
                              <span className="absolute top-2 right-2 bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">
                                {t('common.live')}
                              </span>
                            )}
                          </div>
                          <div className="p-3">
                            <p className="text-sm font-semibold text-slate-800 truncate">{a.title || a.name}</p>
                            <div className="mt-2 flex items-center justify-between gap-1 flex-wrap">
                              <span className="text-xs text-slate-500">{t('shopfront.currentBid')}: <strong>{bid}</strong></span>
                              <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">{t('shopfront.bidNow')}</span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )
              }
            </section>

            {/* Featured Buy Now Offers */}
            <section id="shopfront-products">
              <h3 className="flex items-center gap-2 font-bold text-slate-800 mb-3">
                <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" aria-hidden />
                {t('shopfront.sectionBuyNow')}
              </h3>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {liveProducts === null
                ? <div className="h-20 flex items-center text-slate-400 text-sm"><span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2" />{t('shopfront.loadingProducts')}</div>
                : liveProducts.length === 0
                ? <div className="h-20 flex flex-col items-center justify-center text-slate-400 text-sm gap-1"><span className="text-2xl">📦</span><span>{t('shopfront.noProducts')}</span></div>
                : liveProducts.map((p) => {
                  const pid = p._id || p.id;
                  const price = p.priceCents != null ? '$' + (p.priceCents / 100).toFixed(2) : (p.price || '');
                  return (
                    <div key={pid}
                      className="shrink-0 flex flex-col gap-2 bg-white rounded-xl border border-slate-200 p-3 hover:shadow-md transition-shadow min-w-[160px]">
                      <div className="flex items-center gap-3">
                        {p.imageUrls?.[0]
                          ? <img src={p.imageUrls[0]} alt={p.name} className="w-10 h-10 rounded-lg object-cover" />
                          : <span className="text-3xl" aria-hidden>{p.icon || '📦'}</span>
                        }
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{p.name}</p>
                          <p className="text-sm font-bold text-amber-600 mt-0.5">{price}</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => handleAdd(p)}
                        className={`w-full py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          added === pid
                            ? 'bg-green-500 text-white'
                            : 'bg-slate-900 text-white hover:bg-slate-700'
                        }`}>
                        {added === pid ? t('shopfront.sent') : t('shopfront.addToCart', { defaultValue: 'Add to cart' })}
                      </button>
                    </div>
                  );
                })
              }
              </div>
            </section>

            {/* Bottom CTA */}
            <div className="rounded-2xl overflow-hidden flex items-center justify-between gap-4 px-6 py-4 bg-[var(--accent)]">
              <p className="text-white font-semibold text-sm sm:text-base">{t('shopfront.ctaTitle')}</p>
              <Link to="/live"
                className="shrink-0 bg-white text-blue-700 font-bold text-sm px-6 py-2.5 rounded-xl hover:bg-blue-50 transition-colors">
                {t('shopfront.ctaButton')}
              </Link>
            </div>
            </>
            )}
          </main>

          {/* Right sidebar */}
          <aside className="hidden lg:flex flex-col gap-4 w-60 shrink-0">
            {/* Creator card */}
            {profile && (
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col items-center text-center gap-3">
                {profile.avatarUrl
                  ? <img src={profile.avatarUrl} alt={profile.displayName} className="w-14 h-14 rounded-full object-cover border-2 border-slate-100" />
                  : <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xl font-bold">{(profile.displayName || 'C')[0].toUpperCase()}</div>
                }
                <div>
                  <p className="font-bold text-slate-800">{profile.displayName || t('shopfront.creator')}</p>
                  {profile.bio && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{profile.bio}</p>}
                </div>
                <Link to={`/creator/${id}`} className="w-full py-2 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-colors text-center">
                  {t('shopfront.viewProfile')}
                </Link>
              </div>
            )}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <h4 className="font-bold text-slate-800 text-sm mb-3">{t('shopfront.quickLinks')}</h4>
              <ul className="space-y-3">
                {[
                  { label: t('shopfront.linkAuctions'), to: `/creator/${id}/auctions`, badge: auctions?.filter((a) => a.status === 'live').length > 0 ? t('common.live') : null },
                  { label: t('shopfront.linkAllProducts'), to: `/creator/${id}/shop`, badge: null },
                  { label: t('shopfront.linkCreatorProfile'), to: `/creator/${id}`, badge: null },
                ].map((c) => (
                  <li key={c.to} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full shrink-0 bg-blue-50 flex items-center justify-center text-blue-600 text-xs font-bold">
                      {c.label[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 truncate">
                        <Link to={c.to} className="hover:underline">{c.label}</Link>
                        {c.badge && (
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-red-500 text-white">{c.badge}</span>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Top products (from live data) */}
            {liveProducts && liveProducts.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h4 className="font-bold text-slate-800 text-sm mb-3">{t('shopfront.topProducts')}</h4>
                <ul className="space-y-3">
                  {liveProducts.slice(0, 3).map((p) => (
                    <li key={p._id || p.id} className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-xl shrink-0" aria-hidden>
                        {p.imageUrls?.[0] ? <img src={p.imageUrls[0]} alt={p.name} className="w-full h-full object-cover rounded-lg" /> : '📦'}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800 truncate max-w-[120px]">{p.name}</p>
                        <p className="text-xs text-amber-600 mt-0.5">
                          {p.priceCents != null ? '$' + (p.priceCents / 100).toFixed(2) : '—'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
