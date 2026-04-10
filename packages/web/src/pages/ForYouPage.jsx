import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import {
  IconSearch, IconLive, IconFlash, IconUsers,
  IconTrendingUp, IconGamepad, IconBrush, IconUtensils, IconSmile,
  IconEye, IconVideo,
} from '../components/Icons';
import { ShortsFeed } from '../components/ShortsFeed';
import { fetchFeed, search, unlockPpvStream } from '../sdk/contentApi';

function fmtViewers(n) {
  if (!n) return '0';
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}

const PAGE_SIZE = 20;

/* ── Premium unlock overlay (blurred preview + purchase modal) ── */
function PremiumUnlockOverlay({ title, priceCents, onClick }) {
  const { t } = useTranslation();
  const price = priceCents ? (priceCents / 100).toFixed(2) : '0.00';
  return (
    <div
      onClick={onClick}
      className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md cursor-pointer z-10 transition-opacity hover:bg-black/70"
    >
      <span className="text-3xl mb-2" aria-hidden>🔒</span>
      <p className="text-sm font-semibold text-white drop-shadow">{t('feed.premiumContent', { defaultValue: 'Premium Content' })}</p>
      <p className="text-base font-bold text-white mt-1 drop-shadow">
        {t('feed.unlockFor', { defaultValue: 'Unlock for' })} ${price}
      </p>
    </div>
  );
}

/* ── Purchase modal for PPV stream ── */
function PpvPurchaseModal({ item, onClose, onUnlocked }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const handleUnlock = async () => {
    if (!item?.id) return;
    setBusy(true); setErr(null);
    try {
      await unlockPpvStream(item.id);
      onUnlocked();
      onClose();
    } catch (e) {
      setErr(e.message || (e.status === 402 ? t('feed.insufficientBalance', { defaultValue: 'Insufficient balance' }) : t('feed.unlockFailed', { defaultValue: 'Unlock failed' })));
    }
    setBusy(false);
  };

  const price = item?.priceCents ? (item.priceCents / 100).toFixed(2) : '0.00';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          {item?.thumbnailUrl ? (
            <img src={item.thumbnailUrl} alt={item.title} className="w-16 h-12 rounded-lg object-cover" />
          ) : (
            <div className="w-16 h-12 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center text-2xl">🔒</div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[var(--text)] truncate">{item?.title || t('feed.premiumContent', { defaultValue: 'Premium Content' })}</p>
            <p className="text-sm text-[var(--text-muted)]">{item?.creator}</p>
          </div>
        </div>
        <p className="text-sm text-[var(--text-muted)] mb-4">{t('feed.unlockDescription', { defaultValue: 'Unlock this content to watch.' })}</p>
        {err && <p className="text-sm text-red-500 mb-3">{err}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)]">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={handleUnlock} disabled={busy}
            className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {busy && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {t('feed.unlockFor', { defaultValue: 'Unlock for' })} ${price}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ForYouPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab,      setTab]      = useState('foryou');
  const [category, setCategory] = useState('all');
  const [items,    setItems]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [hasMore,  setHasMore]  = useState(true);
  const [offset,   setOffset]   = useState(0);
  const [query,    setQuery]    = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [purchaseModalItem, setPurchaseModalItem] = useState(null);
  const searchTimer = useRef(null);
  const sentinelRef = useRef(null); // IntersectionObserver target

  const TABS = [
    { id: 'live',      label: t('feed.tabs.live'),      Icon: IconLive  },
    { id: 'foryou',    label: t('nav.explore'),          Icon: IconFlash },
    { id: 'shorts',    label: t('feed.tabs.shorts', 'Shorts'), Icon: IconVideo },
    { id: 'following', label: t('feed.tabs.following'), Icon: IconUsers },
  ];
  const CATEGORIES = [
    { id: 'all',      label: t('common.seeAll'),            Icon: IconSearch      },
    { id: 'trending', label: t('feed.categories.trending'), Icon: IconTrendingUp  },
    { id: 'gaming',   label: t('feed.categories.gaming'),   Icon: IconGamepad     },
    { id: 'art',      label: t('feed.categories.art'),      Icon: IconBrush       },
    { id: 'food',     label: t('feed.categories.food'),     Icon: IconUtensils    },
    { id: 'comedy',   label: t('feed.categories.comedy'),   Icon: IconSmile       },
  ];

  // Initial / tab+category change: reset and fetch page 1
  useEffect(() => {
    setLoading(true);
    setApiError(false);
    setItems([]);
    setOffset(0);
    setHasMore(true);
    fetchFeed(tab, category, PAGE_SIZE, 0)
      .then((data) => {
        const fetched = data.items ?? [];
        setItems(fetched);
        setHasMore(fetched.length >= PAGE_SIZE);
        setOffset(fetched.length);
      })
      .catch(() => {
        setApiError(true);
        setHasMore(false);
      })
      .finally(() => setLoading(false));
  }, [tab, category]);

  // Load more pages
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    fetchFeed(tab, category, PAGE_SIZE, offset)
      .then((data) => {
        const fetched = data.items ?? [];
        setItems((prev) => [...prev, ...fetched]);
        setHasMore(fetched.length >= PAGE_SIZE);
        setOffset((o) => o + fetched.length);
      })
      .catch(() => setHasMore(false))
      .finally(() => setLoadingMore(false));
  }, [tab, category, offset, hasMore, loading, loadingMore]);

  // IntersectionObserver — trigger loadMore when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) loadMore(); }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  // Debounced search
  const handleSearch = useCallback((q) => {
    setQuery(q);
    clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults(null); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const data = await search(q);
        setSearchResults(data.results || []);
      } catch { setSearchResults([]); }
    }, 300);
  }, []);

  const displayItems = loading
    ? Array.from({ length: 8 }, (_, i) => ({ id: `skel-${i}`, skeleton: true }))
    : items;

  return (
    <>
      <SEO title={t('feed.seoTitle')} description={t('feed.seoDesc')} path="/feed" />
      <div className="max-w-6xl mx-auto px-4 py-6">

        {/* Search */}
        <div className="mb-6 relative max-w-sm">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
          <input type="search" placeholder={t('feed.searchPlaceholder')}
            value={query} onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] placeholder-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)]" />
          {/* Search results dropdown */}
          {searchResults && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl shadow-xl z-40 overflow-hidden">
              {searchResults.length === 0 && (
                <div className="px-4 py-3 text-sm text-[var(--text-muted)]">{t('feed.noResults', { query })}</div>
              )}
              {searchResults.map((r) => (
                <button key={r.id}
                  onClick={() => { setSearchResults(null); setQuery(''); if (r.type === 'creator') navigate(`/creator/${r.id}`); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--bg-card)] transition-colors text-left">
                  {r.avatarUrl
                    ? <img src={r.avatarUrl} alt={r.label} className="w-7 h-7 rounded-full object-cover" />
                    : <div className="w-7 h-7 rounded-full bg-[var(--muted)] flex items-center justify-center text-xs font-bold text-[var(--text-muted)]">{r.label[0]}</div>
                  }
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--text)] truncate">{r.label}</div>
                    <div className="text-xs text-[var(--text-muted)] truncate">{r.sub}</div>
                  </div>
                  <span className="ml-auto text-[10px] uppercase font-medium text-[var(--text-muted)] border border-[var(--border)] rounded px-1.5 py-0.5">{r.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[var(--border)] mb-6">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              className={'flex items-center gap-1.5 px-4 pb-3 pt-1 font-medium text-sm transition-colors ' +
                (tab === id ? 'text-[var(--text)] border-b-2 border-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]')}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {/* Shorts tab — full-screen vertical feed */}
        {tab === 'shorts' && (
          <div className="fixed inset-0 z-40 bg-black" style={{ top: 0, left: 0, right: 0, bottom: 0 }}>
            <ShortsFeed tab="shorts" category={category} />
            <button
              type="button"
              onClick={() => setTab('foryou')}
              className="absolute top-4 left-4 z-50 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-black/70"
              aria-label="Back"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        )}

        {/* Categories (hidden when shorts) */}
        {tab !== 'shorts' && (
        <div className="flex gap-2 overflow-x-auto pb-4">
          {CATEGORIES.map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => setCategory(id)}
              className={'shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors ' +
                (category === id ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--border-strong)]')}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>
        )}

        {/* API error banner */}
        {tab !== 'shorts' && apiError && !loading && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/8 text-amber-700">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span className="text-sm">{t('feed.errorBanner')}</span>
            <button type="button"
              onClick={() => { setApiError(false); setLoading(true); fetchFeed(tab, category, PAGE_SIZE, 0).then((d) => { const f = d.items ?? []; setItems(f); setHasMore(f.length >= PAGE_SIZE); setOffset(f.length); }).catch(() => setApiError(true)).finally(() => setLoading(false)); }}
              className="ml-auto text-xs font-semibold underline hover:no-underline">
              {t('common.retry')}
            </button>
          </div>
        )}

        {/* Empty state — only when truly empty (not loading, no error) */}
        {tab !== 'shorts' && !loading && !apiError && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <IconVideo className="w-14 h-14 text-[var(--text-muted)] mb-4" />
            <p className="text-lg font-semibold text-[var(--text)]">{t('feed.emptyTitle')}</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">{t('feed.emptySubtitle')}</p>
            {tab === 'following' && (
              <button type="button" onClick={() => setTab('foryou')}
                className="mt-4 px-5 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors">
                {t('feed.browseForyou')}
              </button>
            )}
          </div>
        )}

        {/* Grid */}
        {tab !== 'shorts' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {displayItems.map((item) => item.skeleton ? (
            <div key={item.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden animate-pulse">
              <div className="aspect-video bg-[var(--bg-elevated)]" />
              <div className="p-3.5 space-y-2">
                <div className="h-3 bg-[var(--bg-elevated)] rounded w-3/4" />
                <div className="h-3 bg-[var(--bg-elevated)] rounded w-1/2" />
              </div>
            </div>
          ) : item.isLocked && item.priceCents ? (
            <div key={item.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden hover:border-[var(--border-strong)] transition-all group cursor-pointer"
              onClick={() => setPurchaseModalItem(item)}
            >
              <div className="aspect-video bg-[var(--bg-elevated)] flex items-center justify-center relative overflow-hidden">
                {item.thumbnailUrl
                  ? <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover blur-xl scale-110" />
                  : <div className="w-full h-full bg-[var(--bg-elevated)]" />
                }
                <PremiumUnlockOverlay
                  title={item.title}
                  priceCents={item.priceCents}
                  onClick={() => setPurchaseModalItem(item)}
                />
                {(item.type === 'live' || item.status === 'live') && (
                  <span className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold text-white bg-[var(--accent-live)] z-20">
                    <IconLive className="w-3 h-3" /> LIVE
                  </span>
                )}
              </div>
              <div className="p-3.5">
                <p className="font-semibold text-[var(--text)] text-sm truncate">{item.title}</p>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    {item.avatarUrl
                      ? <img src={item.avatarUrl} alt={item.creator} className="w-6 h-6 rounded-full object-cover" />
                      : <div className="w-6 h-6 rounded-full bg-[var(--muted)]" />
                    }
                    <span className="text-xs text-[var(--text-muted)] truncate max-w-[100px]">{item.creator}</span>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                    <IconEye className="w-3 h-3" />
                    {fmtViewers(item.viewers)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <Link key={item.id}
              to={item.type === 'event'
                ? `/live/events/${item.id}`
                : (item.creatorId
                  ? (item.type === 'live' ? `/live/${item.id}` : `/creator/${item.creatorId}`)
                  : '/live')}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden hover:border-[var(--border-strong)] transition-all group">
              <div className="aspect-video bg-[var(--bg-elevated)] flex items-center justify-center relative overflow-hidden">
                {item.thumbnailUrl
                  ? <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" />
                  : <IconVideo className="w-10 h-10 text-[var(--muted)] group-hover:text-[var(--text-muted)] transition-colors" />
                }
                {(item.type === 'live' || item.status === 'live') && (
                  <span className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold text-white bg-[var(--accent-live)]">
                    <IconLive className="w-3 h-3" /> LIVE
                  </span>
                )}
                {item.type === 'event' && (
                  <span className="absolute top-2.5 left-2.5 flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold text-[var(--text)] bg-[var(--bg-card)] border border-[var(--border)]">
                    {t('live.scheduled')}
                  </span>
                )}
              </div>
              <div className="p-3.5">
                <p className="font-semibold text-[var(--text)] text-sm truncate">{item.title}</p>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    {item.avatarUrl
                      ? <img src={item.avatarUrl} alt={item.creator} className="w-6 h-6 rounded-full object-cover" />
                      : <div className="w-6 h-6 rounded-full bg-[var(--muted)]" />
                    }
                    <span className="text-xs text-[var(--text-muted)] truncate max-w-[100px]">{item.creator}</span>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                    <IconEye className="w-3 h-3" />
                    {fmtViewers(item.viewers)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
        )}

        {/* Infinite scroll sentinel + load-more indicator */}
        {tab !== 'shorts' && (
        <div ref={sentinelRef} className="mt-6 flex justify-center py-4">
          {loadingMore && (
            <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
              <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              {t('common.loading')}
            </div>
          )}
          {!hasMore && items.length > 0 && !loading && (
            <p className="text-xs text-[var(--text-muted)]">{t('feed.allCaughtUp')}</p>
          )}
        </div>
        )}

        {/* PPV Purchase modal */}
        {purchaseModalItem && (
          <PpvPurchaseModal
            item={purchaseModalItem}
            onClose={() => setPurchaseModalItem(null)}
            onUnlocked={() => {
              setItems((prev) => prev.map((i) =>
                i.id === purchaseModalItem.id ? { ...i, isLocked: false } : i
              ));
            }}
          />
        )}

        {/* App download banner */}
        {tab !== 'shorts' && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 flex items-center justify-between">
          <div>
            <p className="font-semibold text-[var(--text)] text-sm">Download Millo Mobile</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Watch on the go</p>
          </div>
          <span className="w-10 h-10 rounded-xl bg-[var(--accent)] flex items-center justify-center text-white font-bold text-sm">m</span>
        </div>
        )}
      </div>
    </>
  );
}
