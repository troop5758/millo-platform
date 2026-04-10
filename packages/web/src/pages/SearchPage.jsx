/**
 * SearchPage — full search with People / Streams / Products tabs + pagination.
 * GET /content/search?q=&type=&category=&limit=&offset=
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { IconUser, IconVideo, IconLive } from '../components/Icons';
import { searchAdvanced } from '../sdk/contentApi';

function fmtNum(n) {
  if (!n && n !== 0) return '';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}

const CATEGORIES = ['all', 'gaming', 'music', 'art', 'cooking', 'fitness', 'education', 'comedy', 'beauty', 'tech', 'lifestyle'];


/* ── Result cards ── */
function UserCard({ u, t }) {
  return (
    <Link to={`/creator/${u._id || u.id}`}
      className="flex items-center gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] hover:border-[var(--accent)]/30 transition-all group">
      <div className="w-12 h-12 rounded-full bg-[var(--accent)]/15 overflow-hidden shrink-0 flex items-center justify-center">
        {u.avatarUrl
          ? <img src={u.avatarUrl} alt={u.displayName} className="w-full h-full object-cover" />
          : <span className="text-base font-bold text-[var(--accent)]">{(u.displayName || 'U')[0].toUpperCase()}</span>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[var(--text)] text-sm group-hover:text-[var(--accent)] transition-colors truncate">
          {u.displayName || u.handle}
        </p>
        {u.handle && <p className="text-xs text-[var(--text-muted)]">@{u.handle}</p>}
        {u.bio && <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-1">{u.bio}</p>}
      </div>
      {u.followerCount > 0 && (
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-[var(--text)]">{fmtNum(u.followerCount)}</p>
          <p className="text-xs text-[var(--text-muted)]">{t('search.followers')}</p>
        </div>
      )}
    </Link>
  );
}

function StreamCard({ s, t }) {
  const isLive = s.status === 'live';
  return (
    <Link to={s._id ? `/live/${s._id}` : '/live'}
      className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden hover:shadow-lg transition-shadow group">
      <div className="aspect-video bg-[var(--bg-elevated)] relative overflow-hidden">
        {s.thumbnailUrl
          ? <img src={s.thumbnailUrl} alt={s.title} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center">
              <IconVideo className="w-8 h-8 text-[var(--text-muted)] opacity-30" />
            </div>}
        {isLive && (
          <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded bg-red-600 text-white text-xs font-bold">
            <IconLive className="w-3 h-3" /> LIVE
          </span>
        )}
        {s.viewerCount > 0 && (
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/60 text-white text-xs">
            {fmtNum(s.viewerCount)} {t('search.watching')}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="font-semibold text-[var(--text)] text-sm truncate group-hover:text-[var(--accent)] transition-colors">
          {s.title || t('search.liveStream')}
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">{s.creatorName || s.displayName}</p>
      </div>
    </Link>
  );
}

function ProductCard({ p }) {
  const creatorId = p.creatorId?._id || p.creatorId;
  return (
    <Link to={`/creator/${creatorId}/shop/${p._id}`}
      className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden hover:shadow-lg transition-shadow group">
      <div className="aspect-square bg-[var(--bg-elevated)] overflow-hidden">
        {p.imageUrls?.[0]
          ? <img src={p.imageUrls[0]} alt={p.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-3xl">🛍️</div>}
      </div>
      <div className="p-3">
        <p className="font-semibold text-[var(--text)] text-sm truncate group-hover:text-[var(--accent)] transition-colors">{p.name}</p>
        <p className="text-sm font-bold text-[var(--accent)] mt-0.5">
          ${((p.priceCents ?? 0) / 100).toFixed(2)}
        </p>
      </div>
    </Link>
  );
}

/* ── Main page ── */
export function SearchPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initQ   = searchParams.get('q') || '';
  const initType = searchParams.get('type') || 'all';

  const TYPES = [
    { id: 'all',      label: t('search.all') },
    { id: 'users',    label: t('search.people') },
    { id: 'streams',  label: t('search.streams') },
    { id: 'products', label: t('search.products') },
  ];

  const [query,    setQuery]    = useState(initQ);
  const [type,     setType]     = useState(initType);
  const [category, setCategory] = useState('all');
  const [results,  setResults]  = useState({ users: [], streams: [], products: [] });
  const [loading,  setLoading]  = useState(true);
  const [searched, setSearched] = useState(false);
  const [total,    setTotal]    = useState(0);
  const [offset,   setOffset]   = useState(0);
  const [hasMore,  setHasMore]  = useState(false);
  const [error,    setError]    = useState('');
  const [trendingHashtags, setTrendingHashtags] = useState([]);
  const [isDiscovery, setIsDiscovery] = useState(false);
  const inputRef = useRef(null);

  const runSearch = useCallback(async (q, t, cat, off = 0, append = false) => {
    setLoading(true);
    try {
      const trimmed = (q || '').trim();
      const data = await searchAdvanced({
        q: trimmed,
        type: t,
        category: cat !== 'all' ? cat : undefined,
        limit: 20,
        offset: off,
      });
      const newUsers = data.users || [];
      const newStreams = data.streams || [];
      const newProducts = data.products || [];
      setResults((prev) =>
        append
          ? {
              users: [...prev.users, ...newUsers],
              streams: [...prev.streams, ...newStreams],
              products: [...prev.products, ...newProducts],
            }
          : { users: newUsers, streams: newStreams, products: newProducts }
      );
      const newTotal = data.total || newUsers.length + newStreams.length + newProducts.length;
      setTotal(newTotal);
      setHasMore(newTotal > off + 20);
      setOffset(off + 20);
      setSearched(true);
      setError('');
      setTrendingHashtags(data.trendingHashtags || []);
      setIsDiscovery(Boolean(data.discovery) && !trimmed);
      if (trimmed) {
        setSearchParams({ q: trimmed, type: t }, { replace: true });
      } else {
        setSearchParams({ type: t }, { replace: true });
      }
    } catch (e) {
      setError(e.message || t('common.error'));
    }
    setLoading(false);
  }, [setSearchParams, t]);

  useEffect(() => {
    runSearch(initQ, initType, 'all', 0, false);
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e) => {
    e?.preventDefault();
    setOffset(0);
    runSearch(query, type, category, 0, false);
  };

  const handleTypeChange = (t) => {
    setType(t);
    if (searched) runSearch(query, t, category, 0, false);
  };

  const handleCategoryChange = (cat) => {
    setCategory(cat);
    if (searched) runSearch(query, type, cat, 0, false);
  };

  const onHashtagClick = (tag) => {
    const raw = (tag || '').replace(/^#/, '');
    setQuery(raw);
    setOffset(0);
    runSearch(raw, type, category, 0, false);
  };

  const allItems = [...results.users, ...results.streams, ...results.products];
  const showUsers    = type === 'all' || type === 'users';
  const showStreams   = type === 'all' || type === 'streams';
  const showProducts = type === 'all' || type === 'products';

  return (
    <>
      <SEO title={`${t('search.title')} — Millo`} description="Search creators, live streams, and products on Millo." path="/search" />
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Search bar */}
        <form onSubmit={handleSubmit} className="mb-6">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('search.placeholder')}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] placeholder-[var(--text-muted)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
            </div>
            <button type="submit" disabled={loading}
              className="px-5 py-3 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 flex items-center gap-2 shrink-0">
              {loading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : t('search.searchBtn')}
            </button>
          </div>
        </form>

        {/* Type tabs */}
        <div className="flex gap-1 border-b border-[var(--border)] mb-4">
          {TYPES.map((t) => (
            <button key={t.id} type="button" onClick={() => handleTypeChange(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                type === t.id
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}>
              {t.label}
              {searched && t.id === 'users'    && results.users.length > 0    && ` (${results.users.length})`}
              {searched && t.id === 'streams'  && results.streams.length > 0  && ` (${results.streams.length})`}
              {searched && t.id === 'products' && results.products.length > 0 && ` (${results.products.length})`}
              {searched && t.id === 'all'      && total > 0                   && ` (${total})`}
            </button>
          ))}
        </div>

        {/* Category filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" onClick={() => handleCategoryChange(c)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                category === c
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)]/30'
              }`}>
              {c[0].toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span className="flex-1">{error}</span>
            <button type="button" onClick={() => setError('')} className="opacity-70 hover:opacity-100">✕</button>
          </div>
        )}

        {isDiscovery && trendingHashtags.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
              {t('search.trendingHashtags')}
            </h2>
            <div className="flex flex-wrap gap-2">
              {trendingHashtags.map((h, hi) => (
                <button
                  key={`${h.tag}-${hi}`}
                  type="button"
                  onClick={() => onHashtagClick(h.tag)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]/40"
                >
                  #{String(h.tag || '').replace(/^#/, '')}
                  {h.count != null ? (
                    <span className="text-[var(--text-muted)] text-xs ml-1">{fmtNum(h.count)}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Results */}
        {!searched && !loading && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-[var(--text-muted)] font-medium">{t('search.emptyHint')}</p>
            <p className="text-sm text-[var(--text-muted)] mt-1 opacity-70">{t('search.emptyHintDesc')}</p>
          </div>
        )}

        {searched && total === 0 && !loading && !isDiscovery && (
          <div className="text-center py-16">
            <p className="text-[var(--text-muted)] font-medium">{t('search.noResults', { query })}</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">{t('search.noResultsDesc')}</p>
          </div>
        )}

        {searched && (
          <div className="space-y-8">
            {/* People */}
            {showUsers && results.users.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
                  {isDiscovery ? t('search.suggestedCreators') : t('search.sectionPeople')}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {results.users.map((u) => <UserCard key={String(u._id || u.id)} u={u} t={t} />)}
                </div>
              </section>
            )}

            {/* Streams */}
            {showStreams && results.streams.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
                  {isDiscovery ? t('search.liveNowStreams') : t('search.sectionStreams')}
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {results.streams.map((s) => <StreamCard key={String(s._id || s.id)} s={s} t={t} />)}
                </div>
              </section>
            )}

            {/* Products */}
            {showProducts && results.products.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">{t('search.sectionProducts')}</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {results.products.map((p) => <ProductCard key={String(p._id || p.id)} p={p} />)}
                </div>
              </section>
            )}

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <button type="button"
                  onClick={() => runSearch(query, type, category, offset, true)}
                  disabled={loading}
                  className="px-6 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50">
                  {loading ? t('common.loading') : t('search.loadMore')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
