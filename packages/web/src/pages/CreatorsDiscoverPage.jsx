/**
 * Creator directory — /creators. GET /content/creators/discover
 * https://milloapp.com
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { IconLive } from '../components/Icons';
import { fetchCreatorsDiscover } from '../sdk/contentApi';

const SORTS = [
  { id: 'trending', labelKey: 'creatorsDiscover.sortTrending' },
  { id: 'top_earning', labelKey: 'creatorsDiscover.sortEarning' },
  { id: 'live_now', labelKey: 'creatorsDiscover.sortLive' },
];

const CATEGORIES = ['all', 'gaming', 'music', 'art', 'cooking', 'fitness', 'education', 'comedy', 'beauty', 'tech', 'lifestyle'];

function fmtNum(n) {
  if (!n && n !== 0) return '0';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace('.0', '')}K`;
  return String(n);
}

export default function CreatorsDiscoverPage() {
  const { t } = useTranslation();
  const [sort, setSort] = useState('trending');
  const [category, setCategory] = useState('all');
  const [liveOnly, setLiveOnly] = useState(false);
  const [creators, setCreators] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchCreatorsDiscover({
        sort,
        category: category !== 'all' ? category : undefined,
        live: liveOnly,
        limit: 30,
        offset: 0,
      });
      setCreators(data.creators || []);
      setTotal(data.total ?? (data.creators || []).length);
    } catch (e) {
      setError(e.message || t('common.error'));
      setCreators([]);
    }
    setLoading(false);
  }, [sort, category, liveOnly, t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <SEO title={t('creatorsDiscover.seoTitle')} description={t('creatorsDiscover.seoDesc')} path="/creators" />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-[var(--text)] mb-2">{t('creatorsDiscover.title')}</h1>
        <p className="text-sm text-[var(--text-muted)] mb-6">{t('creatorsDiscover.subtitle')}</p>

        <div className="flex flex-wrap gap-2 mb-4">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSort(s.id)}
              className={
                'px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ' +
                (sort === s.id
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]')
              }
            >
              {t(s.labelKey)}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setLiveOnly((v) => !v)}
            className={
              'px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1 ' +
              (liveOnly
                ? 'bg-red-600 text-white'
                : 'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]')
            }
          >
            <IconLive className="w-3 h-3" />
            {t('creatorsDiscover.liveFilter')}
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-3 mb-6">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={
                'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ' +
                (category === c
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]')
              }
            >
              {c[0].toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-10 h-10 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : creators.length === 0 ? (
          <p className="text-center text-[var(--text-muted)] py-16">{t('creatorsDiscover.empty')}</p>
        ) : (
          <>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              {t('creatorsDiscover.showing', { count: creators.length, total })}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {creators.map((c) => (
                <Link
                  key={String(c.userId)}
                  to={c.isLive && c.liveStreamId ? `/live/${c.liveStreamId}` : `/creator/${c.userId}`}
                  className="group rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden hover:border-[var(--accent)]/40 hover:shadow-lg transition-all"
                >
                  <div className="aspect-[3/4] bg-[var(--bg-elevated)] relative">
                    {c.avatarUrl ? (
                      <img src={c.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-[var(--text-muted)]">
                        {(c.displayName || '?')[0]}
                      </div>
                    )}
                    {c.isLive && (
                      <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-600 text-white text-[10px] font-bold">
                        <IconLive className="w-3 h-3" />
                        LIVE
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="font-semibold text-sm text-[var(--text)] truncate group-hover:text-[var(--accent)]">
                      {c.displayName}
                    </p>
                    {c.handle ? <p className="text-xs text-[var(--text-muted)] truncate">@{c.handle}</p> : null}
                    <p className="text-[11px] text-[var(--text-muted)] mt-1">
                      {fmtNum(c.followerCount)} {t('search.followers')}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
