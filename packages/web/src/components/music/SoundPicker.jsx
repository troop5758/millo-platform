/**
 * SoundPicker — TikTok-style sound selector: search, genre filter, trending, 15-second preview.
 * GET /music/search?q=lofi, GET /music/trending, GET /music/:id
 * https://milloapp.com
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { searchMusic, getMusicTrending, getMusicSponsored, getMusicChallenges } from '../../sdk/musicApi';

const PREVIEW_SECONDS = 15;
const GENRES = ['all', 'lofi', 'chill', 'pop', 'electronic', 'acoustic', 'upbeat', 'cinematic'];

export function SoundPicker({ open, onClose, onSelect }) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [genre, setGenre] = useState('all');
  const [trending, setTrending] = useState([]);
  const [sponsored, setSponsored] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const [previewEnded, setPreviewEnded] = useState(false);
  const audioRef = useRef(null);
  const previewTimerRef = useRef(null);

  const loadTrending = useCallback(async () => {
    setLoadingTrending(true);
    try {
      const data = await getMusicTrending({ limit: 20, ...(genre !== 'all' && { genre }) });
      setTrending(data.tracks || []);
    } catch {
      setTrending([]);
    } finally {
      setLoadingTrending(false);
    }
  }, [genre]);

  const loadSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setLoadingSearch(true);
    try {
      const data = await searchMusic(q, { limit: 24 });
      setSearchResults(data.tracks || []);
    } catch {
      setSearchResults([]);
    } finally {
      setLoadingSearch(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (!open) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      setPlayingId(null);
      return;
    }
    loadTrending();
    getMusicSponsored({ limit: 10 }).then((d) => setSponsored(d.tracks || [])).catch(() => setSponsored([]));
    getMusicChallenges({ limit: 10 }).then((d) => setChallenges(d.challenges || [])).catch(() => setChallenges([]));
  }, [open, loadTrending]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(loadSearch, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, open, loadSearch]);

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setPlayingId(null);
    setPreviewEnded(false);
  }, []);

  const playPreview = useCallback((track) => {
    const url = track.audioUrl || track.streamUrl;
    if (!url) return;
    stopPreview();
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlayingId(track._id);
    setPreviewEnded(false);
    const stopAt = PREVIEW_SECONDS;
    const onTimeUpdate = () => {
      if (audio.currentTime >= stopAt) {
        audio.pause();
        audio.removeEventListener('timeupdate', onTimeUpdate);
        if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
        setPlayingId(null);
        setPreviewEnded(true);
      }
    };
    audio.addEventListener('timeupdate', onTimeUpdate);
    previewTimerRef.current = setTimeout(() => {
      if (audioRef.current === audio) {
        audio.pause();
        setPlayingId(null);
        setPreviewEnded(true);
      }
    }, stopAt * 1000);
    audio.play().catch(() => {
      setPlayingId(null);
    });
  }, [stopPreview]);

  const handleSelect = (track) => {
    stopPreview();
    onSelect?.(track);
    onClose?.();
  };

  const showSearch = searchQuery.trim().length >= 2;
  const list = showSearch ? searchResults : trending;
  const loading = showSearch ? loadingSearch : loadingTrending;

  const formatDuration = (sec) => {
    if (sec == null || sec <= 0) return '—';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => { stopPreview(); onClose?.(); }}>
      <div className="bg-[var(--bg-elevated)] rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <h2 className="text-lg font-semibold text-[var(--text)]">
            {t('music.soundPickerTitle', 'Add sound')}
          </h2>
          <button type="button" onClick={() => { stopPreview(); onClose?.(); }} className="p-2 rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text)]" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <p className="px-4 pb-2 text-xs text-[var(--text-muted)]">
          {t('sounds.incentivePicker', 'Using trending sounds can boost your reach and discoverability.')}
        </p>

        {/* Search */}
        <div className="p-3 border-b border-[var(--border)] shrink-0">
          <input
            type="search"
            placeholder={t('music.searchPlaceholder', 'Search by title, artist, genre…')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] text-sm"
          />
        </div>

        {/* Genre filter */}
        <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0">
          {GENRES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGenre(g)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${genre === g ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)]'}`}
            >
              {g === 'all' ? t('music.genreAll', 'All') : g}
            </button>
          ))}
        </div>

        {/* Sponsored sounds (when not searching) */}
        {!showSearch && sponsored.length > 0 && (
          <div className="px-4 pt-2 pb-2 shrink-0 border-b border-[var(--border)]">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
              {t('music.sponsoredSounds', 'Sponsored')}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1">
              {sponsored.map((track) => (
                <button
                  key={track._id}
                  type="button"
                  onClick={() => handleSelect(track)}
                  className="flex-shrink-0 w-32 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-2 text-left hover:border-[var(--accent)] transition-colors"
                >
                  <p className="text-sm font-medium text-[var(--text)] truncate">{track.title}</p>
                  <p className="text-xs text-[var(--text-muted)] truncate">{track.brandName || track.artist}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sound challenges (when not searching) */}
        {!showSearch && challenges.length > 0 && (
          <div className="px-4 pt-2 pb-2 shrink-0 border-b border-[var(--border)]">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
              {t('music.soundChallenges', 'Challenges')}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1">
              {challenges.map((ch) => (
                <button
                  key={ch._id}
                  type="button"
                  onClick={() => ch.track && handleSelect(ch.track)}
                  className="flex-shrink-0 w-36 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-2 text-left hover:border-[var(--accent)] transition-colors"
                >
                  <p className="text-sm font-medium text-[var(--text)] truncate">{ch.challengeName}</p>
                  <p className="text-xs text-[var(--text-muted)] truncate">{ch.brandName}</p>
                  {ch.track && <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">🎵 {ch.track.title}</p>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Section label */}
        <div className="px-4 pt-2 pb-1 shrink-0">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
            {showSearch ? t('music.searchResults', 'Search results') : t('music.trendingSounds', 'Trending sounds')}
          </p>
        </div>

        {/* Track list with preview */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="py-12 flex justify-center">
              <div className="w-8 h-8 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-12 text-center px-4">
              {showSearch ? t('music.noTracks', 'No tracks found.') : t('music.noTrending', 'No trending sounds yet.')}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {list.map((track) => (
                <li key={track._id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--bg-card)] transition-colors">
                  <button
                    type="button"
                    onClick={() => playingId === track._id ? stopPreview() : playPreview(track)}
                    className="w-10 h-10 rounded-full bg-[var(--bg)] flex items-center justify-center shrink-0 hover:bg-[var(--accent-subtle)] text-[var(--text-muted)] hover:text-[var(--accent)]"
                    aria-label={playingId === track._id ? 'Stop preview' : 'Play 15s preview'}
                  >
                    {playingId === track._id ? (
                      <svg className="w-5 h-5 text-[var(--accent)]" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                    ) : (
                      <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    )}
                  </button>
                  <button type="button" onClick={() => handleSelect(track)} className="flex-1 min-w-0 text-left">
                    <p className="font-medium text-[var(--text)] truncate">{track.title}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{track.artist || '—'} · {formatDuration(track.duration ?? track.durationSeconds)} {track.genre ? `· ${track.genre}` : ''}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelect(track)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90"
                  >
                    {t('music.useTrack', 'Use')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-[var(--text-muted)] px-4 py-2 border-t border-[var(--border)] shrink-0">
          {t('music.previewHint', '15-second preview. Tap Use to add this sound.')}
        </p>
      </div>
    </div>
  );
}
