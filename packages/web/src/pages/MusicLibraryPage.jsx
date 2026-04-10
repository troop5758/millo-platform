/**
 * MusicLibraryPage — browse royalty-free music for streams and videos.
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { getMusicTracks, searchMusic } from '../sdk/musicApi';

export function MusicLibraryPage() {
  const { t } = useTranslation();
  const [tracks, setTracks] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setLoading(true);
    const load = search.trim().length >= 2
      ? searchMusic(search.trim(), { limit: 24 }).then((d) => ({ tracks: d.tracks || [], total: d.total ?? 0 }))
      : getMusicTracks({ limit: 24, offset: 0 });
    load
      .then((data) => {
        setTracks(data.tracks || []);
        setTotal(data.total ?? 0);
      })
      .catch(() => { setTracks([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [search]);

  return (
    <>
      <SEO title={t('music.pageTitle', 'Royalty-free music')} description={t('music.pageDesc', 'Browse and use royalty-free tracks in your streams and videos.')} path="/music" />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-[var(--text)]">{t('music.pageTitle', 'Royalty-free music')}</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">{t('music.pageSubtitle', 'Use these tracks in your streams and videos without copyright issues.')}</p>
        <div className="mt-4 flex gap-2">
          <input
            type="search"
            placeholder={t('music.searchPlaceholder', 'Search by title, artist, genre…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 max-w-sm px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
        {loading ? (
          <p className="text-sm text-[var(--text-muted)] py-12 text-center">{t('music.loading', 'Loading…')}</p>
        ) : tracks.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-12 text-center">{t('music.noTracks', 'No tracks found.')}</p>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {tracks.map((track) => (
              <li key={track._id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-[var(--bg)] flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[var(--text)] truncate">{track.title}</p>
                  <p className="text-xs text-[var(--text-muted)] truncate">{track.artist || '—'} · {track.licenseId?.name || '—'}</p>
                </div>
                <button type="button" onClick={() => setSelected(track)} className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90">
                  {t('music.useTrack', 'Use')}
                </button>
              </li>
            ))}
          </ul>
        )}
        {selected && (
          <div className="mt-6 p-4 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-subtle)]">
            <p className="text-sm font-medium text-[var(--text)]">{t('music.selected', 'Selected')}: {selected.title} — {selected.artist || '—'}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">{t('music.copyUrlHint', 'Copy the URL below and add it as an audio source in OBS or your streaming app.')}</p>
            <code className="mt-2 block text-xs font-mono text-[var(--text)] break-all bg-[var(--bg)] rounded-lg p-2">{selected.streamUrl || '—'}</code>
          </div>
        )}
      </div>
    </>
  );
}
