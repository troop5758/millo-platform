import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../../components/SEO';
import { fetchCreator, fetchCreatorAuctions, fetchCreatorProducts } from '../../sdk/contentApi';

function fmtCents(cents) {
  if (cents == null) return null;
  if (!Number.isFinite(cents)) return null;
  return '$' + (cents / 100).toFixed(2);
}

export function StorePage() {
  const { creator } = useParams();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [products, setProducts] = useState(null); // null = loading
  const [auctions, setAuctions] = useState(null); // null = loading
  const [search, setSearch] = useState('');

  useEffect(() => {
    let mounted = true;
    async function run() {
      setLoading(true);
      setError('');
      setProducts(null);
      setAuctions(null);
      try {
        if (!creator) throw new Error('Missing creator');
        const [p, a, c] = await Promise.all([
          fetchCreatorProducts(creator),
          fetchCreatorAuctions(creator),
          fetchCreator(creator),
        ]);

        if (!mounted) return;
        setProducts(Array.isArray(p) ? p : []);
        setAuctions(Array.isArray(a) ? a : []);
        setCreatorProfile(c || null);
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load store');
        setProducts([]);
        setAuctions([]);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }
    run();
    return () => {
      mounted = false;
    };
  }, [creator]);

  const q = search.trim().toLowerCase();
  const visibleProducts = products === null
    ? null
    : q
      ? products.filter((p) =>
          (p?.name || '').toLowerCase().includes(q) ||
          (p?.description || '').toLowerCase().includes(q)
        )
      : products;

  const visibleAuctions = auctions === null
    ? null
    : q
      ? auctions.filter((a) => (a?.title || '').toLowerCase().includes(q))
      : auctions;

  const creatorName = creatorProfile?.displayName || creator;

  return (
    <>
      <SEO
        title={t('store.title', { creator: creatorName, defaultValue: 'Store' })}
        description={t('store.desc', { defaultValue: 'Products and auctions' })}
        path={`/store/${creator || ''}`}
        image={creatorProfile?.avatarUrl || undefined}
      />

      <div className="min-h-screen bg-[#f0f2f7]">
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[min(100%,18rem)]">
              <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                </svg>
                <input
                  type="search"
                  placeholder={t('store.searchPlaceholder', { defaultValue: 'Search products and auctions...' })}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none w-full"
                />
              </div>
            </div>
            <Link
              to={`/creator/${encodeURIComponent(creator || '')}`}
              className="text-sm font-semibold text-blue-600 hover:underline sm:ml-auto"
            >
              {t('store.creatorProfile', { defaultValue: 'Creator' })}
            </Link>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-800">{creatorName}'s Store</h1>
              <p className="text-sm text-slate-500 mt-1">{t('store.subtitle', { defaultValue: 'Buy now items and live auctions.' })}</p>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-16 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Products */}
              <section>
                <h2 className="text-lg font-bold text-slate-800 mb-3">{t('store.products', { defaultValue: 'Products' })}</h2>
                {visibleProducts.length === 0 ? (
                  <p className="text-sm text-slate-500">{t('store.noProducts', { defaultValue: 'No products found.' })}</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {visibleProducts.map((p) => {
                      const pid = p._id || p.id;
                      const img = p.imageUrls?.[0] || p.imageUrl || p.thumbnailUrl || null;
                      return (
                        <Link
                          key={pid}
                          to={`/product/${encodeURIComponent(pid)}`}
                          className="rounded-2xl border border-slate-200 bg-white overflow-hidden hover:border-blue-200 hover:shadow-md transition-shadow"
                        >
                          <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
                            {img ? (
                              <img src={img} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-5xl" aria-hidden>
                                📦
                              </span>
                            )}
                          </div>
                          <div className="p-3">
                            <div className="font-semibold text-slate-800 text-sm truncate">{p.name}</div>
                            <div className="mt-2 text-sm font-bold text-blue-600">
                              {fmtCents(p.priceCents)}
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Auctions */}
              <section>
                <h2 className="text-lg font-bold text-slate-800 mb-3">
                  {t('store.auctions', { defaultValue: 'Auctions' })}
                </h2>
                {visibleAuctions.length === 0 ? (
                  <p className="text-sm text-slate-500">{t('store.noAuctions', { defaultValue: 'No auctions found.' })}</p>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visibleAuctions.map((a) => {
                      const aid = a._id || a.id;
                      const img = a.imageUrl || a.thumbnailUrl || null;
                      const price = fmtCents(a.currentBidCents ?? a.startBidCents);
                      return (
                        <Link
                          key={aid}
                          to={`/auction/${encodeURIComponent(aid)}`}
                          className="rounded-2xl border border-slate-200 bg-white overflow-hidden hover:border-blue-200 hover:shadow-md transition-shadow"
                        >
                          <div className="aspect-video bg-slate-100 relative">
                            {img ? (
                              <img src={img} alt={a.title} className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-5xl" aria-hidden>
                                🔨
                              </span>
                            )}
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-bold">
                              {String(a.status || 'live').toUpperCase()}
                            </div>
                          </div>
                          <div className="p-3">
                            <div className="font-semibold text-slate-800 text-sm truncate">{a.title}</div>
                            <div className="mt-2 text-sm font-bold text-blue-600">{price}</div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}

