/**
 * Trending Sounds — discover sounds through trending, genre sections, and search.
 * UI: 🔥 Trending Sounds, 🎵 Dance Beats, 🎧 Comedy Sounds, sound search.
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { getMusicTrending, searchMusic, getMusicRegions } from '../sdk/musicApi';

function SoundCard({ track, onUse }) {
  const { t } = useTranslation();
  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 flex items-center gap-3 hover:border-[var(--border-strong)] transition-colors">
      <div className="w-12 h-12 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center shrink-0">
        <span className="text-xl" aria-hidden>🎵</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-[var(--text)] truncate">{track.title}</p>
        <p className="text-xs text-[var(--text-muted)] truncate">{track.artist || '—'} · {(track.genre || '').trim() || '—'}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          to={`/music?highlight=${encodeURIComponent(track._id)}`}
          className="text-sm text-[var(--accent)] hover:underline"
        >
          {t('sounds.viewTrack', 'View')}
        </Link>
        {onUse && (
          <button
            type="button"
            onClick={() => onUse(track)}
            className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90"
          >
            {t('music.useTrack', 'Use')}
          </button>
        )}
      </div>
    </li>
  );
}

function SectionBlock({ title, icon, tracks, loading, onUse }) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <section className="mt-8">
        <h2 className="text-lg font-bold text-[var(--text)] flex items-center gap-2">
          <span aria-hidden>{icon}</span>
          {title}
        </h2>
        <p className="text-sm text-[var(--text-muted)] py-8 text-center">{t('music.loading', 'Loading…')}</p>
      </section>
    );
  }
  if (!tracks || tracks.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-[var(--text)] flex items-center gap-2 mb-4">
        <span aria-hidden>{icon}</span>
        {title}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tracks.map((track) => (
          <SoundCard key={track._id} track={track} onUse={onUse} />
        ))}
      </ul>
    </section>
  );
}

export function TrendingSoundsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [trending, setTrending] = useState([]);
  const [dance, setDance] = useState([]);
  const [comedy, setComedy] = useState([]);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [loadingDance, setLoadingDance] = useState(true);
  const [loadingComedy, setLoadingComedy] = useState(true);
  const [regions, setRegions] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState('');

  const loadTrending = useCallback(async () => {
    setLoadingTrending(true);
    try {
      const data = await getMusicTrending({ limit: 12, ...(selectedRegion && { region: selectedRegion }) });
      setTrending(data.tracks || []);
    } catch {
      setTrending([]);
    } finally {
      setLoadingTrending(false);
    }
  }, [selectedRegion]);

  const loadDance = useCallback(async () => {
    setLoadingDance(true);
    try {
      const data = await getMusicTrending({ limit: 8, genre: 'dance' });
      setDance(data.tracks || []);
    } catch {
      setDance([]);
    } finally {
      setLoadingDance(false);
    }
  }, []);

  const loadComedy = useCallback(async () => {
    setLoadingComedy(true);
    try {
      const data = await getMusicTrending({ limit: 8, genre: 'comedy' });
      setComedy(data.tracks || []);
    } catch {
      setComedy([]);
    } finally {
      setLoadingComedy(false);
    }
  }, []);

  useEffect(() => {
    loadTrending();
  }, [loadTrending]);

  useEffect(() => {
    loadDance();
    loadComedy();
  }, [loadDance, loadComedy]);

  useEffect(() => {
    getMusicRegions().then((d) => setRegions(d.regions || []));
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      searchMusic(searchQuery.trim(), { limit: 16 })
        .then((d) => setSearchResults(d.tracks || []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleUse = (track) => {
    navigate('/music', { state: { selectedTrack: track } });
  };

  return (
    <>
      <SEO
        title={t('sounds.pageTitle', 'Trending Sounds')}
        description={t('sounds.pageDesc', 'Discover trending sounds, dance beats, comedy sounds and more.')}
        path="/sounds/trending"
      />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <span aria-hidden>🔥</span>
          {t('sounds.pageTitle', 'Trending Sounds')}
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          {t('sounds.pageSubtitle', 'Discover sounds through trending, genres, and search. Use them in your streams and videos.')}
        </p>
        <div className="mt-4 p-4 rounded-xl border border-[var(--accent)]/20 bg-[var(--accent-subtle)]" role="region" aria-label={t('sounds.incentiveLabel', 'Creator benefits')}>
          <p className="text-sm font-medium text-[var(--text)]">
            {t('sounds.incentiveHeadline', 'Creators benefit from using trending sounds')}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {t('sounds.incentiveDesc', 'Higher reach, more discoverability, and follower growth. This drives organic adoption.')}
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)] list-none">
            <li>{t('sounds.benefitReach', 'Higher reach')}</li>
            <li>{t('sounds.benefitDiscoverability', 'More discoverability')}</li>
            <li>{t('sounds.benefitFollowers', 'Follower growth')}</li>
          </ul>
        </div>

        {/* Sound search */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <input
            type="search"
            placeholder={t('sounds.searchPlaceholder', 'Search sounds by title, artist, genre…')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            aria-label={t('sounds.searchPlaceholder', 'Search sounds')}
          />
          {regions.length > 0 && (
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              aria-label={t('sounds.regionFilter', 'Region')}
            >
              <option value="">{t('sounds.regionGlobal', 'Global')}</option>
              {regions.map((r) => (
                <option key={r.slug} value={r.slug}>{r.code} ({r.slug})</option>
              ))}
            </select>
          )}
        </div>

        {/* Search results */}
        {searchQuery.trim().length >= 2 && (
          <section className="mt-6">
            <h2 className="text-lg font-bold text-[var(--text)] mb-4">
              {t('sounds.searchResults', 'Search results')} {searching && '…'}
            </h2>
            {searching ? (
              <p className="text-sm text-[var(--text-muted)] py-6 text-center">{t('music.loading', 'Loading…')}</p>
            ) : searchResults.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)] py-6">{t('music.noTracks', 'No tracks found.')}</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {searchResults.map((track) => (
                  <SoundCard key={track._id} track={track} onUse={handleUse} />
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Trending + genre sections when not searching */}
        {searchQuery.trim().length < 2 && (
          <>
            <SectionBlock
              title={t('sounds.trending', 'Trending Sounds')}
              icon="🔥"
              tracks={trending}
              loading={loadingTrending}
              onUse={handleUse}
            />
            <SectionBlock
              title={t('sounds.danceBeats', 'Dance Beats')}
              icon="🎵"
              tracks={dance}
              loading={loadingDance}
              onUse={handleUse}
            />
            <SectionBlock
              title={t('sounds.comedySounds', 'Comedy Sounds')}
              icon="🎧"
              tracks={comedy}
              loading={loadingComedy}
              onUse={handleUse}
            />
          </>
        )}

        <p className="mt-10 text-center">
          <Link to="/music" className="text-sm font-medium text-[var(--accent)] hover:underline">
            {t('sounds.browseFullLibrary', 'Browse full music library →')}
          </Link>
        </p>
      </div>
    </>
  );
}
