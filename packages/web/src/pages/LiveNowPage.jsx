/**
 * LiveNowPage — live stream grid + inline viewer with VideoPlayer + live chat.
 * Fetches real streams from /content/streams. Falls back to graceful empty state.
 * https://milloapp.com
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { IconLive, IconLock, IconEye, IconUser, IconUsers, IconVideo, IconGift } from '../components/Icons';
import { GiftPanel, GiftAnimation, GiftFloaters, getAnimationPriority } from '../components/GiftPanel';
import { EmojiRain } from '../components/EmojiRain';
import { VideoPlayer } from '../components/VideoPlayer';
import { fetchStreams } from '../sdk/contentApi';
import { getUser } from '../sdk/authApi';
import { ReportModal } from '../components/ReportModal';
import { LiveFiltersComingSoonBanner } from '../components/LiveHonestyBanners';
import { features } from '../config/features';
import { useLiveFiltersControlsVisible } from '../hooks/useLiveModeStatus';

function IconClock(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}
function IconPlus(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function IconX(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function IconFilter(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function fmtViewers(n) {
  if (!n && n !== 0) return null;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}

function elapsed(startedAt) {
  if (!startedAt) return null;
  const s = Math.floor((Date.now() - new Date(startedAt)) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/* ── Event card (upcoming live event) ── */
function EventCard({ event }) {
  const { t } = useTranslation();
  const att = event.attendanceCount ?? event.viewers ?? 0;
  const scheduled = event.scheduledStart ? new Date(event.scheduledStart).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  return (
    <Link to={`/live/events/${event.id}`}
      className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group block">
      <div className="relative aspect-video bg-[var(--bg-elevated)] flex items-center justify-center overflow-hidden">
        {event.thumbnailUrl ? (
          <img src={event.thumbnailUrl} alt={event.title} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <IconVideo className="w-10 h-10 text-[var(--text-muted)] opacity-40" />
        )}
        <span className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--text)] bg-[var(--bg-card)] border border-[var(--border)]">
          <IconClock className="w-3 h-3" /> {t('live.scheduled')}
        </span>
        {event.ticketPriceCents > 0 && (
          <span className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-[var(--accent-live)] text-white">
            ${(event.ticketPriceCents / 100).toFixed(2)}
          </span>
        )}
        {att > 0 && (
          <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-white text-xs">
            <IconUsers className="w-3 h-3" /> {fmtViewers(att)}
          </span>
        )}
        {scheduled && (
          <span className="absolute bottom-2.5 left-2.5 px-2 py-1 rounded-md bg-black/60 text-white text-xs truncate max-w-[80%]">
            {scheduled}
          </span>
        )}
      </div>
      <div className="p-3.5 flex gap-3">
        <div className="w-9 h-9 rounded-full bg-[var(--accent)]/15 shrink-0 overflow-hidden flex items-center justify-center">
          {event.avatarUrl
            ? <img src={event.avatarUrl} alt={event.creator} className="w-full h-full object-cover" />
            : <IconUser className="w-4 h-4 text-[var(--accent)]" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--text)] text-sm truncate">{event.title || t('eventCountdown.title', { defaultValue: 'Live Event' })}</p>
          <p className="text-xs text-[var(--text-muted)] truncate">{event.creator}</p>
        </div>
      </div>
    </Link>
  );
}

/* ── Stream card ── */
function StreamCard({ s, onWatch, onGift, onReport }) {
  const { t } = useTranslation();
  const vc = fmtViewers(s.viewerCount ?? s.viewers);
  const dur = elapsed(s.startedAt);
  const isLive = s.status === 'live';
  const creator = s.creator || {};
  const displayName = creator.displayName || s.displayName || s.creator_name || t('live.creator');
  const avatarUrl   = creator.avatarUrl   || s.avatarUrl   || null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
      onClick={() => onWatch(s)}>
      {/* Thumbnail / preview area */}
      <div className="relative aspect-video bg-[var(--bg-elevated)] flex items-center justify-center overflow-hidden">
        {s.thumbnailUrl ? (
          <img src={s.thumbnailUrl} alt={s.title} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <IconVideo className="w-10 h-10 text-[var(--text-muted)] opacity-40" />
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        {/* Badges */}
        {isLive && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-red-600 shadow">
            <IconLive className="w-3 h-3" /> {t('common.live')}
          </span>
        )}
        {s.status === 'scheduled' && (
          <span className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-[var(--text)] bg-[var(--bg-card)] border border-[var(--border)]">
            <IconClock className="w-3 h-3" /> {t('live.scheduled')}
          </span>
        )}
        {s.priceCents > 0 && (
          <span className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-[var(--accent-live)] text-white">
            ${(s.priceCents / 100).toFixed(2)}
          </span>
        )}
        {vc && features.liveViewerCount && (
          <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-white text-xs">
            <IconEye className="w-3 h-3" /> {vc}
          </span>
        )}
        {dur && (
          <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-white text-xs">
            <IconClock className="w-3 h-3" /> {dur}
          </span>
        )}
        {/* Gift shortcut */}
        {isLive && features.liveGifts && (
          <button type="button"
            onClick={(e) => { e.stopPropagation(); onGift(s); }}
            className="absolute bottom-2.5 left-2.5 hidden group-hover:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[var(--accent)] hover:opacity-90 transition-opacity shadow-md">
            <IconGift className="w-3.5 h-3.5" /> {t('live.gift')}
          </button>
        )}
      </div>

      {/* Info row */}
      <div className="p-3.5 flex gap-3">
        <div className="w-9 h-9 rounded-full bg-[var(--accent)]/15 shrink-0 overflow-hidden flex items-center justify-center">
          {avatarUrl
            ? <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            : <IconUser className="w-4 h-4 text-[var(--accent)]" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--text)] text-sm truncate">{s.title || t('live.liveStream')}</p>
          <p className="text-xs text-[var(--text-muted)] truncate">{displayName}</p>
        </div>
        <button type="button"
          onClick={(e) => { e.stopPropagation(); onReport(s); }}
          title={t('live.reportStream')}
          className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ── Watch modal — full video player + live chat + gifts ── */
const LIVE_FILTERS = [
  { id: null, labelKey: 'live.filterNone' },
  { id: 'grayscale', labelKey: 'live.filterGrayscale' },
  { id: 'vintage', labelKey: 'live.filterVintage' },
];

function WatchModal({ stream, onClose }) {
  const { t } = useTranslation();
  const filtersLiveUi = useLiveFiltersControlsVisible();
  const [giftOpen, setGiftOpen] = useState(false);
  const [floaters, setFloaters] = useState([]);
  const [activity, setActivity] = useState([]);
  const [reactionBursts, setReactionBursts] = useState([]);
  const [filterId, setFilterId] = useState(null);
  const [moderationState, setModerationState] = useState({ chatMuted: false, reactionsDisabled: false, giftsBlocked: false });
  const nextKey = useRef(0);
  const user = getUser();
  const creator = stream.creator || {};
  const creatorId = stream.userId || stream.creatorId || creator?.id;
  const isModerator = !!user && !!creatorId && String(user._id) === String(creatorId);

  const PRIORITY_DURATION = { small: 2000, large: 3500, fullscreen: 5000 };
  const handleSend = useCallback((gift) => {
    const key  = nextKey.current++;
    const left = 10 + Math.random() * 70;
    const priority = getAnimationPriority(gift.tier);
    setFloaters((f) => [...f, { key, left, Svg: gift.Svg, gift, priority }]);
    setActivity((a) => [{ user: user?.displayName || t('live.you'), giftName: gift.name, coins: gift.coins }, ...a.slice(0, 9)]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.key !== key)), PRIORITY_DURATION[priority] || 2500);
    setGiftOpen(false);
  }, [user]);

  // Lock scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl max-h-[92vh] flex flex-col lg:flex-row rounded-2xl overflow-hidden shadow-2xl bg-[var(--bg)] border border-[var(--border)]">
        {/* Video column */}
        <div className="flex-1 min-w-0 bg-black relative">
          {features.liveGifts ? <GiftFloaters floaters={floaters} /> : null}
          {/* TikTok-style emoji burst rain */}
          <EmojiRain bursts={reactionBursts} />

          <VideoPlayer
            src={stream.playbackUrl}
            poster={stream.thumbnailUrl}
            live={stream.status === 'live'}
            autoPlay
            streamId={String(stream._id || stream.id)}
            showChat={false}
            filterId={filterId}
            className="rounded-none"
          />
          {/* Filter selector — gated by GET /api/live/status (filters LIVE) + profile / Vite */}
          {stream.status === 'live' && !filtersLiveUi ? (
            <div className="absolute top-3 left-3 z-30 max-w-[14rem]">
              <LiveFiltersComingSoonBanner />
            </div>
          ) : null}
          {stream.status === 'live' && filtersLiveUi ? (
            <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5">
              <IconFilter className="w-4 h-4 text-white/70 shrink-0" />
              <div className="flex gap-1 rounded-lg bg-black/50 backdrop-blur-sm p-0.5">
                {LIVE_FILTERS.map((f) => (
                  <button
                    key={f.id ?? 'none'}
                    type="button"
                    onClick={() => setFilterId(f.id)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${filterId === f.id
                      ? 'bg-white/90 text-black'
                      : 'text-white/80 hover:text-white hover:bg-white/20'}`}
                  >
                    {t(f.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {/* Controls bar */}
          <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
            {stream.status === 'live' && features.liveGifts && (
              <button
                type="button"
                onClick={() => { if (moderationState.giftsBlocked) return; setGiftOpen(true); }}
                disabled={moderationState.giftsBlocked}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] shadow transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <IconGift className="w-3.5 h-3.5" /> {t('live.gift')}
              </button>
            )}
            <button type="button" onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors">
              <IconX className="w-4 h-4" />
            </button>
          </div>

          {/* Stream info bar */}
          <div className="px-4 py-3 bg-[var(--bg-elevated)] border-t border-[var(--border)]">
            <p className="font-semibold text-[var(--text)] text-sm truncate">{stream.title || t('live.liveStream')}</p>
            <p className="text-xs text-[var(--text-muted)]">
              {creator.displayName || t('live.creator')}
              {features.liveViewerCount && stream.viewerCount ? ` · ${fmtViewers(stream.viewerCount)} ${t('live.watching')}` : ''}
            </p>
          </div>
        </div>

        {/* Chat + activity column */}
        <div className="w-full lg:w-72 shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l border-[var(--border)] bg-[var(--bg-elevated)] max-h-[300px] lg:max-h-none">
          {/* Gift activity */}
          {features.liveGifts && activity.length > 0 && (
            <div className="border-b border-[var(--border)] max-h-36 overflow-y-auto">
              {activity.map((a, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2">
                  <IconUser className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  <p className="text-xs text-[var(--text-muted)] truncate">
                    <span className="font-semibold text-[var(--text)]">{a.user}</span>
                    {' '}{t('live.sent')} <span className="text-[var(--accent-premium)] font-medium">{a.giftName}</span>
                    {' '}({a.coins} {t('live.coins')})
                  </p>
                </div>
              ))}
            </div>
          )}
          {/* Live chat */}
          <div className="flex-1 min-h-0">
            {stream.playbackUrl && stream.status === 'live' && features.liveChat ? (
              <div className="h-full">
                {React.createElement(
                  require('../components/LiveChat').LiveChat,
                  {
                    streamId: String(stream._id || stream.id),
                    className: 'h-full rounded-none border-0',
                    onReactionBurst: (msg) => setReactionBursts((b) => [...b.slice(-19), msg]),
                    onModerationState: setModerationState,
                    isModerator,
                    moderationState,
                  }
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6 text-center">
                <p className="text-xs text-[var(--text-muted)]">
                  {stream.status === 'ended' ? t('live.streamEnded') : t('live.chatLive')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Gift panel */}
      {giftOpen && features.liveGifts && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setGiftOpen(false)} />
          <div className="relative w-full max-w-lg h-[70vh] rounded-t-2xl overflow-hidden shadow-2xl">
            <GiftPanel onClose={() => setGiftOpen(false)} onSend={handleSend} receiverId={stream?.userId || stream?.creatorId} streamId={String(stream._id || stream.id)} giftsBlocked={moderationState.giftsBlocked} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main page ── */
export function LiveNowPage() {
  const { t } = useTranslation();
  const [filter,    setFilter]    = useState('all');
  const [streams,   setStreams]   = useState([]);
  const [counts,    setCounts]    = useState({ all: 0, public: 0, private: 0, ppv: 0 });
  const [loading,   setLoading]   = useState(true);
  const [watching,  setWatching]  = useState(null);
  const [giftFor,   setGiftFor]   = useState(null);
  const [reportFor, setReportFor] = useState(null);
  const [floaters,  setFloaters]  = useState([]);
  const [activity,  setActivity]  = useState([]);
  const nextKey = useRef(0);

  const FILTERS = [
    { id: 'all',     label: t('live.all'),       count: counts.all     },
    { id: 'public',  label: t('live.public'),     count: counts.public  },
    { id: 'private', label: t('live.private'),    count: counts.private },
    { id: 'ppv',     label: t('live.payPerView'), count: counts.ppv     },
  ];

  const [upcomingEvents, setUpcomingEvents] = useState([]);

  useEffect(() => {
    setLoading(true);
    fetchStreams(filter)
      .then((data) => {
        if (Array.isArray(data.streams)) setStreams(data.streams);
        if (Array.isArray(data.upcomingEvents)) setUpcomingEvents(data.upcomingEvents);
        if (data.counts) setCounts((c) => ({ ...c, ...data.counts }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);

  const PRIORITY_DURATION = { small: 2000, large: 3500, fullscreen: 5000 };
  const handleGiftSend = useCallback((gift) => {
    const key  = nextKey.current++;
    const left = 10 + Math.random() * 70;
    const priority = getAnimationPriority(gift.tier);
    setFloaters((f) => [...f, { key, left, Svg: gift.Svg, gift, priority }]);
    setActivity((a) => [{ user: t('live.you'), giftName: gift.name, coins: gift.coins }, ...a.slice(0, 9)]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.key !== key)), PRIORITY_DURATION[priority] || 2500);
    setGiftFor(null);
  }, [t]);

  return (
    <>
      <SEO title={t('live.seoTitle')} description={t('live.seoDesc')} path="/live" />

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">{t('live.title')}</h1>
            <p className="text-[var(--text-muted)] text-sm mt-0.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              {t('live.liveCount', { count: streams.filter((s) => s.status === 'live').length })}
            </p>
          </div>
          <Link to="/go-live"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-red-600 hover:bg-red-700 transition-colors shadow">
            <IconLive className="w-4 h-4" />
            {t('live.goLive')}
          </Link>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)}
              className={'shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ' +
                (filter === f.id
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]')}>
              {f.label} <span className="opacity-60">({f.count})</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Stream grid */}
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="grid sm:grid-cols-2 gap-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden animate-pulse">
                    <div className="aspect-video bg-[var(--bg-elevated)]" />
                    <div className="p-3.5 flex gap-3">
                      <div className="w-9 h-9 rounded-full bg-[var(--bg-elevated)]" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 bg-[var(--bg-elevated)] rounded w-3/4" />
                        <div className="h-2.5 bg-[var(--bg-elevated)] rounded w-1/2" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : streams.length === 0 && upcomingEvents.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center mx-auto mb-4">
                  <IconVideo className="w-8 h-8 text-[var(--text-muted)]" />
                </div>
                <p className="text-[var(--text-muted)] font-medium">{t('live.noStreams')}</p>
                <p className="text-sm text-[var(--text-muted)] mt-1">{t('live.beFirst')}</p>
                {features.liveGoLive ? (
                <Link to="/go-live"
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors">
                  <IconLive className="w-4 h-4" /> {t('live.goLive')}
                </Link>
                ) : null}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-5">
                {streams.map((s) => (
                  <StreamCard key={String(s._id || s.id)} s={s}
                    onWatch={setWatching}
                    onGift={setGiftFor}
                    onReport={setReportFor}
                  />
                ))}
                {(filter === 'all' ? upcomingEvents : []).map((e) => (
                  <EventCard key={String(e.id)} event={e} />
                ))}
              </div>
            )}
          </div>

          {/* Gift activity sidebar */}
          {features.liveGifts ? (
          <aside className="lg:w-64 shrink-0">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden sticky top-20">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--text)] flex items-center gap-2">
                  <IconGift className="w-4 h-4 text-[var(--accent-premium)]" />
                  {t('live.giftActivity')}
                </p>
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              </div>
              {activity.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-[var(--text-muted)]">
                  {t('live.giftActivityEmpty')}
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border)] max-h-64 overflow-y-auto">
                  {activity.map((a, i) => (
                    <li key={i} className="px-4 py-2.5 flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[var(--accent)]/15 flex items-center justify-center shrink-0">
                        <IconUser className="w-3.5 h-3.5 text-[var(--accent)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--text)] truncate">{a.user}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                          {t('live.sent')} <span className="text-[var(--accent-premium)] font-medium">{a.giftName}</span>
                        </p>
                      </div>
                      <span className="text-xs font-bold text-[var(--accent-premium)] shrink-0">{a.coins}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="p-3">
                <button type="button" onClick={() => setGiftFor(streams[0] || {})}
                  className="w-full py-2.5 rounded-xl font-semibold text-sm text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors flex items-center justify-center gap-2">
                  <IconGift className="w-4 h-4" />
                  {t('live.sendGift')}
                </button>
              </div>
            </div>
          </aside>
          ) : null}
        </div>
      </div>

      {/* Floating gift animations over page (TikTok-style priority) */}
      {features.liveGifts ? (
      <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
        <GiftFloaters floaters={floaters} />
      </div>
      ) : null}

      {/* Watch modal */}
      {watching && (
        <WatchModal stream={watching} onClose={() => setWatching(null)} />
      )}

      {/* Gift panel modal (from sidebar/card) */}
      {features.liveGifts && giftFor && !watching && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setGiftFor(null)} />
          <div className="relative w-full max-w-lg h-[70vh] rounded-t-2xl overflow-hidden shadow-2xl">
            <GiftPanel onClose={() => setGiftFor(null)} onSend={handleGiftSend}
              receiverId={giftFor?.userId || giftFor?.creatorId} streamId={String(giftFor._id || giftFor.id || '')} />
          </div>
        </div>
      )}

      {/* Report modal */}
      <ReportModal
        open={!!reportFor}
        onClose={() => setReportFor(null)}
        targetType="stream"
        targetId={String(reportFor?._id || reportFor?.id || '')}
        targetLabel={reportFor?.title}
      />

      {/* Go Live FAB */}
      {features.liveGoLive ? (
      <Link to="/go-live" aria-label="Go live"
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg bg-red-600 hover:bg-red-700 transition-colors z-40">
        <IconPlus className="w-6 h-6" />
      </Link>
      ) : null}
    </>
  );
}
