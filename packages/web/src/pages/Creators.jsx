import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { apiFetch } from '../lib/api.js';

function fmtNum(n) {
  if (n == null) return '0';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace('.0', '')}K`;
  return String(n);
}

/**
 * Creator directory — GET `/creators` on the API host (not `/api/creators` on the SPA).
 * https://milloapp.com
 */
export default function Creators() {
  const { t } = useTranslation();
  const [creators, setCreators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/creators?sort=trending&limit=48');
      setCreators(Array.isArray(data?.creators) ? data.creators : []);
    } catch (e) {
      setCreators([]);
      setError(e?.message || t('common.error'));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <SEO title={t('creatorsDiscover.seoTitle')} description={t('creatorsDiscover.seoDesc')} path="/creators" />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-[var(--text)] mb-2">{t('creatorsDiscover.title')}</h1>
        <p className="text-sm text-[var(--text-muted)] mb-6">{t('creatorsDiscover.subtitle')}</p>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {creators.map((c) => {
              const id = c._id != null ? String(c._id) : '';
              const username = c.handle || c.username || '';
              return (
                <Link
                  key={id || username}
                  to={id ? `/creator/${id}` : '/creators'}
                  className="bg-[var(--bg-card)] border border-[var(--border)] p-4 rounded-xl hover:border-[var(--accent)]/50 transition-colors text-left"
                >
                  <div className="w-16 h-16 mx-auto rounded-full overflow-hidden bg-[var(--bg-elevated)] mb-3 flex items-center justify-center">
                    {c.avatarUrl ? (
                      <img src={c.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xl font-bold text-[var(--accent)]">
                        {(c.displayName || username || '?')[0]}
                      </span>
                    )}
                  </div>
                  <h2 className="text-sm font-semibold text-[var(--text)] text-center truncate">
                    {c.displayName || username || 'Creator'}
                  </h2>
                  {username ? (
                    <p className="text-xs text-[var(--text-muted)] text-center truncate">@{username}</p>
                  ) : null}
                  <p className="text-xs text-[var(--text-muted)] text-center mt-1">
                    {fmtNum(c.followers)} {t('search.followers')}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
