/**
 * Creator Audio Picker — browse and select royalty-free music for streams/videos.
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getMusicTracks, searchMusic } from '../sdk/musicApi';

export function MusicPicker({ open, onClose, onSelect }) {
  const { t } = useTranslation();
  const [tracks, setTracks] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 16;

  const load = useCallback(async (isSearch, off = 0) => {
    setLoading(true);
    try {
      const data = isSearch && search.trim().length >= 2
        ? await searchMusic(search.trim(), { limit, offset: off })
        : await getMusicTracks({ limit, offset: off });
      setTracks(data.tracks || []);
      setTotal(data.total ?? 0);
      setOffset(off);
    } catch {
      setTracks([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    if (!open) return;
    load(search.trim().length >= 2, 0);
  }, [open, search]);

  const handleSearch = () => load(true, 0);
  const handleSelect = (track) => {
    onSelect?.(track);
    onClose?.();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => onClose?.()}>
      <div className="bg-[var(--bg-elevated)] rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-[var(--text)]">
            {t('music.pickerTitle', 'Royalty-free music')}
          </h2>
          <button type="button" onClick={() => onClose?.()} className="p-2 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-card)]" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-4 border-b border-[var(--border)] flex gap-2">
          <input
            type="search"
            placeholder={t('music.searchPlaceholder', 'Search by title, artist, genre…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <button type="button" onClick={handleSearch} className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90">
            {t('music.search', 'Search')}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-[var(--text-muted)] py-8 text-center">{t('music.loading', 'Loading…')}</p>
          ) : tracks.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-8 text-center">{t('music.noTracks', 'No tracks found.')}</p>
          ) : (
            <ul className="space-y-2">
              {tracks.map((track) => (
                <li key={track._id} className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg)]">
                  <div className="w-10 h-10 rounded-lg bg-[var(--bg)] flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 text-[var(--text-muted)]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[var(--text)] truncate">{track.title}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{track.artist || '—'} · {(track.durationSeconds || 0) > 0 ? `${Math.floor(track.durationSeconds / 60)}:${String(track.durationSeconds % 60).padStart(2, '0')}` : '—'} {track.licenseId?.name ? `· ${track.licenseId.name}` : ''}</p>
                  </div>
                  <button type="button" onClick={() => handleSelect(track)} className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90">
                    {t('music.useTrack', 'Use')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && total > offset + tracks.length && (
            <button type="button" onClick={() => load(search.trim().length >= 2, offset + limit)} className="mt-3 w-full py-2 text-sm text-[var(--accent)] hover:underline">
              {t('music.loadMore', 'Load more')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
