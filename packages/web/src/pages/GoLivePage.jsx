/**
 * GoLivePage — creator stream control room.
 * Allows starting / stopping a live stream, configuring title, visibility, PPV price.
 * Uses POST /content/streams/start and POST /content/streams/:id/stop
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { getUser } from '../sdk/authApi';
import { startStream, stopStream } from '../sdk/contentApi';
import { SoundPicker } from '../components/music/SoundPicker';
import { LiveCohostComingSoonBanner } from '../components/LiveHonestyBanners';

export function GoLivePage() {
  const navigate = useNavigate();
  const { t }    = useTranslation();
  const user = getUser();

  const [title,      setTitle]      = useState('');
  const [visibility, setVisibility] = useState('public');
  const [priceCents, setPriceCents] = useState(0);
  const [busy,       setBusy]       = useState(false);
  const [error,      setError]      = useState(null);
    const [stream,     setStream]     = useState(null); // active stream
  const [ended,      setEnded]      = useState(false);
  const [copied,     setCopied]     = useState(false);

  useEffect(() => {
    if (!user) navigate('/login', { replace: true });
  }, [user, navigate]);

  const MAX_TITLE_LEN = 120;
  const MIN_PPV_CENTS = 99;
  const MAX_PPV_CENTS = 99900;

  const handleGo = async () => {
    if (!title.trim()) { setError(t('goLive.errorTitle')); return; }
    if (title.trim().length > MAX_TITLE_LEN) {
      setError(t('goLive.errorTitleTooLong', { max: MAX_TITLE_LEN }));
      return;
    }
    if (visibility === 'paid') {
      const price = Number(priceCents);
      if (!Number.isInteger(price) || price < MIN_PPV_CENTS) {
        setError(t('goLive.errorPriceTooLow', { min: (MIN_PPV_CENTS / 100).toFixed(2) }));
        return;
      }
      if (price > MAX_PPV_CENTS) {
        setError(t('goLive.errorPriceTooHigh', { max: (MAX_PPV_CENTS / 100).toFixed(2) }));
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const data = await startStream(title.trim(), visibility, visibility === 'paid' ? priceCents : 0);
      setEnded(false);
      setStream(data.stream
        ? { ...data.stream, streamKey: data.streamKey || data.stream.streamKey, ingestUrl: data.ingestUrl, playbackUrl: data.playbackUrl }
        : data);
    } catch (e) {
      if (e.message?.includes('CREATOR_NOT_APPROVED')) {
        setError('CREATOR_NOT_APPROVED');
      } else {
        setError(e.message || t('goLive.startFailed'));
      }
    }
    setBusy(false);
  };

  const handleStop = async () => {
    if (!stream?._id) { setStream(null); return; }
    setBusy(true);
    try {
      await stopStream(stream._id);
      setEnded(true);
      setStream(null);
      setTitle('');
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  const copyKey = () => {
    if (!stream?.streamKey) return;
    navigator.clipboard.writeText(stream.streamKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <>
      <SEO title={t('goLive.seoTitle')} description={t('goLive.seoDesc')} path="/go-live" />
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="8" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">{t('goLive.title')}</h1>
            <p className="text-sm text-[var(--text-muted)]">{t('goLive.subtitle')}</p>
          </div>
        </div>

        {ended && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-[var(--accent)]/10 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-semibold text-[var(--text)] mb-1">{t('goLive.streamEnded')}</p>
            <p className="text-sm text-[var(--text-muted)] mb-4">{t('goLive.streamEndedDesc')}</p>
            <Link to="/dashboard" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors">
              {t('goLive.viewReplays')}
            </Link>
          </div>
        )}

        {!stream ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 space-y-5">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1.5">{t('goLive.streamTitleLabel')}</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('goLive.streamTitlePlaceholder')}
                maxLength={100}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] transition"
              />
            </div>

            {/* Visibility */}
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-2">{t('goLive.visibilityLabel')}</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'public',  label: t('goLive.public'),  desc: t('goLive.publicDesc') },
                  { id: 'private', label: t('goLive.private'), desc: t('goLive.privateDesc') },
                  { id: 'paid',    label: t('goLive.ppv'),     desc: t('goLive.ppvDesc') },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setVisibility(opt.id)}
                    className={`rounded-xl border p-3 text-left transition-all ${
                      visibility === opt.id
                        ? 'border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)]'
                        : 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    <p className="text-sm font-semibold">{opt.label}</p>
                    <p className="text-xs mt-0.5 opacity-75">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* PPV price */}
            {visibility === 'paid' && (
              <div>
                <label className="block text-sm font-medium text-[var(--text)] mb-1.5">{t('goLive.ppvPriceLabel')}</label>
                <input
                  type="number"
                  min={99}
                  max={9999}
                  value={priceCents}
                  onChange={(e) => setPriceCents(Number(e.target.value))}
                  className="w-40 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  = ${(priceCents / 100).toFixed(2)} USD
                </p>
              </div>
            )}

            {/* Background music — royalty-free library */}
            <div>
              <label className="block text-sm font-medium text-[var(--text)] mb-1.5">{t('music.backgroundMusic', 'Background music')}</label>
              {selectedTrack ? (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--text)] truncate">{selectedTrack.title}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{selectedTrack.artist || '—'}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button type="button" onClick={() => { if (selectedTrack.streamUrl) navigator.clipboard.writeText(selectedTrack.streamUrl); setMusicUrlCopied(true); setTimeout(() => setMusicUrlCopied(false), 2000); }} className="px-2 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]">
                      {musicUrlCopied ? t('music.copied', 'Copied') : t('music.copyUrl', 'Copy URL')}
                    </button>
                    <button type="button" onClick={() => setSelectedTrack(null)} className="px-2 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-muted)] hover:text-red-500">×</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setMusicPickerOpen(true)} className="w-full py-2.5 rounded-xl border border-dashed border-[var(--border)] text-[var(--text-muted)] text-sm hover:bg-[var(--bg-elevated)] hover:text-[var(--text)] flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
                  {t('music.pickTrack', 'Pick royalty-free track')}
                </button>
              )}
              <p className="text-xs text-[var(--text-muted)] mt-1">{t('music.pickTrackHint', 'Add the track URL as an audio source in OBS or your streaming software.')}</p>
            </div>

            <SoundPicker open={musicPickerOpen} onClose={() => setMusicPickerOpen(false)} onSelect={setSelectedTrack} />

            {error && error === 'CREATOR_NOT_APPROVED' ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm font-semibold text-amber-600 mb-1">{t('goLive.creatorRequired')}</p>
                <p className="text-sm text-amber-700/80 mb-3">{t('goLive.creatorRequiredDesc')}</p>
                <Link to="/creator-apply"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors">
                  {t('goLive.applyCreator')}
                </Link>
              </div>
            ) : error ? (
              <p className="text-sm text-red-500">{error}</p>
            ) : null}

            <button
              type="button"
              onClick={handleGo}
              disabled={busy || !title.trim()}
              className="w-full py-3 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy
                ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {t('goLive.starting')}</>
                : <>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /></svg>
                    {t('goLive.startStream')}
                  </>
              }
            </button>
          </div>
        ) : (
          /* Active stream control room */
          <div className="rounded-2xl border-2 border-red-500/30 bg-[var(--bg-card)] p-6 space-y-5">
            {/* Live badge */}
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500 text-white text-xs font-bold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-white" />
                {t('goLive.liveBadge')}
              </span>
              <span className="text-sm font-semibold text-[var(--text)]">{stream.title}</span>
            </div>

            {/* Stream key */}
            <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] p-4">
              <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">{t('goLive.streamKeyLabel')}</p>
            <LiveCohostComingSoonBanner className="bg-[var(--bg-elevated)]" />

              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono text-[var(--text)] bg-[var(--bg)] rounded-lg px-3 py-2 overflow-hidden text-ellipsis whitespace-nowrap">
                  {stream.streamKey || '—'}
                </code>
                <button
                  type="button"
                  onClick={copyKey}
                  className="shrink-0 px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-medium hover:bg-[var(--accent-hover)] transition-colors"
                >
                  {copied ? t('goLive.copied') : t('goLive.copy')}
                </button>
              </div>
                <p className="text-xs text-[var(--text-muted)] mt-2">{t('goLive.obsCopy')}</p>
            </div>

            {/* Ingest URL */}
            {stream.ingestUrl && (
              <div className="rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] p-4">
                <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">{t('goLive.rtmpUrlLabel')}</p>
                <code className="text-xs font-mono text-[var(--text)]">{stream.ingestUrl}</code>
              </div>
            )}

            {/* Visibility info */}
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              {t('goLive.visibilityDisplay')} <strong className="text-[var(--text)]">{stream.visibility || 'public'}</strong>
              {stream.priceCents > 0 && (
                <span className="ml-1">— ${(stream.priceCents / 100).toFixed(2)} PPV</span>
              )}
            </div>

            {/* OBS setup guide */}
            <div className="rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 p-4">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-2">{t('goLive.obsSetup')}</p>
              <ol className="text-xs text-blue-600 dark:text-blue-300 space-y-1 list-decimal list-inside">
                <li>{t('goLive.obsStep1')}</li>
                <li>{t('goLive.obsStep2')} <code>{stream.ingestUrl || 'rtmp://ingest.milloapp.com/live'}</code></li>
                <li>{t('goLive.obsStep3')}</li>
                <li>{t('goLive.obsStep4')}</li>
              </ol>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-3">
              <Link to="/live"
                className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text)] text-sm font-medium text-center hover:bg-[var(--bg-elevated)] transition-colors">
                {t('goLive.viewStream')}
              </Link>
              <button
                type="button"
                onClick={handleStop}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl bg-red-500/10 text-red-500 border border-red-500/30 text-sm font-semibold hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50"
              >
                {busy ? t('goLive.stopping') : t('goLive.endStream')}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
