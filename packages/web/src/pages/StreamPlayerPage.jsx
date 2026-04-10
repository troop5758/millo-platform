/**
 * StreamPlayerPage — full-page live stream viewer.
 * Route: /live/:streamId (canonical). Legacy /live/stream/:id redirects here.
 * Fetches stream from GET /content/streams/:id
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { VideoPlayer } from '../components/VideoPlayer';
import { GiftPanel, GiftAnimation, GiftFloaters, GIFTS, getAnimationPriority } from '../components/GiftPanel';
import { EmojiRain } from '../components/EmojiRain';
import { AuctionPanel } from '../components/AuctionPanel';
import { ProductDrop } from '../components/ProductDrop';
import { ReportModal } from '../components/ReportModal';
import { SoundAttribution } from '../components/SoundAttribution';
import { getUser } from '../sdk/authApi';
import { fetchStream } from '../sdk/contentApi';
import { LiveFiltersComingSoonBanner } from '../components/LiveHonestyBanners';
import { features } from '../config/features';
import { useLiveFiltersControlsVisible } from '../hooks/useLiveModeStatus';

function fmtViewers(n) {
  if (!n && n !== 0) return null;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}

function elapsed(startedAt) {
  if (!startedAt) return null;
  const s = Math.floor((Date.now() - new Date(startedAt)) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function IconBack(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M15 19l-7-7 7-7" />
    </svg>
  );
}
function IconFlag(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" />
    </svg>
  );
}
function IconGift(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <path d="M12 22V7m0 0H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zm0 0h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
    </svg>
  );
}
function IconEye(p) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
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

export function StreamPlayerPage() {
  const { streamId } = useParams();
  const navigate     = useNavigate();
  const { t }        = useTranslation();
  const me           = getUser();
  const filtersLiveUi = useLiveFiltersControlsVisible();

  const [stream,      setStream]      = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [giftOpen,    setGiftOpen]    = useState(false);
  const [floaters,    setFloaters]    = useState([]);
  const [activity,    setActivity]    = useState([]);
  const [reportOpen,  setReportOpen]  = useState(false);
  const [productDrop, setProductDrop] = useState(null);
  const [auctionRefresh, setAuctionRefresh] = useState(0);
  const [sendGiftViaWs, setSendGiftViaWs] = useState(null);
  const [filterId, setFilterId] = useState(null);
  const [reactionBursts, setReactionBursts] = useState([]);
  const [moderationState, setModerationState] = useState({ chatMuted: false, reactionsDisabled: false, giftsBlocked: false });
  const nextKey = useRef(0);
  const giftQueueRef = useRef([]);

  const LIVE_FILTERS = [
    { id: null, labelKey: 'live.filterNone' },
    { id: 'grayscale', labelKey: 'live.filterGrayscale' },
    { id: 'vintage', labelKey: 'live.filterVintage' },
  ];

  useEffect(() => {
    if (!streamId) { setError(t('streamPlayer.noStreamId')); setLoading(false); return; }
    fetchStream(streamId)
      .then(setStream)
      .catch(() => setError(t('streamPlayer.notFound')))
      .finally(() => setLoading(false));
  }, [streamId, t]);

  // Auto-refresh viewer count every 30 s while live.
  // Failures are intentionally silent — transient network errors should not
  // interrupt the viewing experience; stale data is preferable to an error banner.
  useEffect(() => {
    if (!stream || stream.status !== 'live') return;
    const id = setInterval(() => {
      fetchStream(streamId)
        .then(setStream)
        .catch((err) => console.warn('[StreamPlayer] auto-refresh failed:', err?.message));
    }, 30_000);
    return () => clearInterval(id);
  }, [stream, streamId]);

  const PRIORITY_DURATION = { small: 2000, large: 3500, fullscreen: 5000 };
  const MAX_SMALL = 6;
  const MAX_LARGE = 1;
  const MAX_FULLSCREEN = 1;

  const processQueue = useCallback(() => {
    const q = giftQueueRef.current;
    if (q.length === 0) return;
    setFloaters((f) => {
      const nextGift = q[0];
      const priority = getAnimationPriority(nextGift.gift.tier);
      const hasFullscreen = f.some((x) => x.priority === 'fullscreen');
      const hasLarge = f.some((x) => x.priority === 'large');
      const smallCount = f.filter((x) => x.priority === 'small').length;
      const canShow =
        (priority === 'fullscreen' && !hasFullscreen) ||
        (priority === 'large' && !hasLarge) ||
        (priority === 'small' && smallCount < MAX_SMALL);
      if (!canShow) return f;
      q.shift();
      const entry = {
        key: nextKey.current++,
        left: 10 + Math.random() * 70,
        Svg: nextGift.gift.Svg,
        gift: nextGift.gift,
        priority,
        user: nextGift.user,
        coins: nextGift.coins,
      };
      const duration = PRIORITY_DURATION[priority] || 2500;
      setTimeout(() => {
        setFloaters((prev) => prev.filter((x) => x.key !== entry.key));
        setTimeout(() => processQueue(), 50);
      }, duration);
      return [...f, entry];
    });
  }, []);

  const addFloater = useCallback((gift, user, coins) => {
    const priority = getAnimationPriority(gift.tier);
    setActivity((a) => [{ user, giftName: gift.name, coins }, ...a.slice(0, 9)]);

    setFloaters((f) => {
      const hasFullscreen = f.some((x) => x.priority === 'fullscreen');
      const hasLarge = f.some((x) => x.priority === 'large');
      const smallCount = f.filter((x) => x.priority === 'small').length;
      const canShow =
        (priority === 'fullscreen' && !hasFullscreen) ||
        (priority === 'large' && !hasLarge) ||
        (priority === 'small' && smallCount < MAX_SMALL);

      if (!canShow) {
        giftQueueRef.current.push({ gift, user, coins });
        return f;
      }
      const entry = {
        key: nextKey.current++,
        left: 10 + Math.random() * 70,
        Svg: gift.Svg,
        gift,
        priority,
        user,
        coins,
      };
      const duration = PRIORITY_DURATION[priority] || 2500;
      setTimeout(() => {
        setFloaters((prev) => prev.filter((x) => x.key !== entry.key));
        setTimeout(() => processQueue(), 50);
      }, duration);
      return [...f, entry];
    });
  }, [processQueue]);

  const handleSendGift = useCallback((gift) => {
    addFloater(gift, me?.displayName || t('live.you'), gift.coins, true);
    setGiftOpen(false);
  }, [me, addFloater, t]);

  const handleGiftReceived = useCallback((msg) => {
    const gift = GIFTS.find((g) => g.id === (msg.gift_id || msg.giftId));
    if (!gift) return;
    addFloater(gift, msg.displayName || 'Viewer', msg.coins);
  }, [addFloater]);

  const creator     = stream?.creator     || {};
  const displayName = creator.displayName || stream?.displayName || t('live.creator');
  const creatorId   = stream?.userId;
  const viewerCount = fmtViewers(stream?.viewerCount);
  const dur         = stream?.startedAt ? elapsed(stream.startedAt) : null;
  const isLive      = stream?.status === 'live';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <>
        <SEO title={t('streamPlayer.notFoundSeo')} path={`/live/${streamId}`} />
        <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-[var(--bg)] px-4">
          <svg className="w-16 h-16 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
          <p className="text-lg font-semibold text-[var(--text)]">{error}</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => navigate(-1)}
              className="px-5 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors">
              {t('common.back')}
            </button>
            <Link to="/live"
              className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-hover)] transition-colors">
              {t('live.title')}
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SEO
        title={t('streamPlayer.seoTitle', { title: stream.title || t('live.liveStream'), creator: displayName })}
        description={t('streamPlayer.seoDesc', { creator: displayName })}
        path={`/live/${streamId}`}
        image={stream.thumbnailUrl || undefined}
        twitterCard="summary_large_image"
      />

      <div className="min-h-screen bg-black flex flex-col">
        {/* Top nav bar */}
        <div className="flex items-center gap-3 px-4 py-3 bg-black/60 backdrop-blur-sm border-b border-white/10 z-30 sticky top-0">
          <button type="button" onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-white/70 hover:text-white transition-colors text-sm font-medium">
            <IconBack className="w-4 h-4" /> {t('common.back')}
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{stream.title || t('live.liveStream')}</p>
          </div>
          {isLive && (
            <span className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-red-600">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> {t('common.live')}
            </span>
          )}
        </div>

        {/* Main content */}
        <div className="flex flex-1 flex-col lg:flex-row max-h-[calc(100vh-56px)]">
          {/* Video + info column */}
          <div className="flex-1 min-w-0 flex flex-col bg-black relative">
            {isLive && features.liveGifts ? <GiftFloaters floaters={floaters} /> : null}
            {/* TikTok-style emoji burst rain */}
            <EmojiRain bursts={reactionBursts} />

            {/* Product drop overlay */}
            {productDrop && (
              <ProductDrop
                product={productDrop}
                creatorId={creatorId}
                onDismiss={() => setProductDrop(null)}
              />
            )}

            {/* Live auction overlay */}
            {isLive && (
              <AuctionPanel
                streamId={String(stream._id || streamId)}
                creatorId={creatorId}
                refreshTrigger={auctionRefresh}
              />
            )}

            {/* Video */}
            <div className="relative flex-1">
              {isLive && !filtersLiveUi ? (
                <div className="absolute top-3 right-3 z-20 max-w-[14rem]">
                  <LiveFiltersComingSoonBanner />
                </div>
              ) : null}
              {isLive && filtersLiveUi ? (
                <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
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
              <VideoPlayer
                src={stream.playbackUrl || stream.streamUrl}
                poster={stream.thumbnailUrl}
                live={isLive}
                autoPlay
                streamId={String(stream._id || streamId)}
                showChat={false}
                filterId={filterId}
                className="rounded-none w-full h-full"
              />
            </div>

            {/* Stream info bar */}
            <div className="bg-[var(--bg)] border-t border-[var(--border)] px-4 py-3">
              <div className="flex items-center gap-3">
                {/* Creator avatar */}
                <Link to={creatorId ? `/creator/${creatorId}` : '#'} className="shrink-0">
                  <div className="w-10 h-10 rounded-full bg-[var(--accent)]/15 overflow-hidden flex items-center justify-center">
                    {creator.avatarUrl
                      ? <img src={creator.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                      : <span className="text-sm font-bold text-[var(--accent)]">{displayName[0]}</span>}
                  </div>
                </Link>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[var(--text)] text-sm truncate">{stream.title || t('live.liveStream')}</p>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    <Link to={creatorId ? `/creator/${creatorId}` : '#'}
                      className="text-xs text-[var(--accent)] hover:underline font-medium">
                      {displayName}
                    </Link>
                    {viewerCount != null && features.liveViewerCount && (
                      <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                        <IconEye className="w-3 h-3" /> {viewerCount} {t('search.watching')}
                      </span>
                    )}
                    {dur && isLive && (
                      <span className="text-xs text-[var(--text-muted)]">{dur}</span>
                    )}
                  </div>
                  {stream.sound && (
                    <div className="mt-2">
                      <SoundAttribution sound={stream.sound} />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isLive && features.liveGifts && (
                    <button
                      type="button"
                      onClick={() => { if (!me) { navigate('/login'); return; } if (moderationState.giftsBlocked) return; setGiftOpen(true); }}
                      disabled={moderationState.giftsBlocked}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-bold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={moderationState.giftsBlocked ? t('live.giftsBlocked', 'Gifts disabled by moderator') : undefined}
                    >
                      <IconGift className="w-3.5 h-3.5" /> {t('live.gift')}
                    </button>
                  )}
                  <button type="button" onClick={() => setReportOpen(true)}
                    title={t('live.reportStream')}
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors">
                    <IconFlag className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Gift activity feed */}
              {features.liveGifts && activity.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-3">
                  {activity.slice(0, 4).map((a, i) => (
                    <p key={i} className="text-xs text-[var(--text-muted)]">
                      <span className="font-semibold text-[var(--text)]">{a.user}</span>
                      {' '}{t('live.sent')} <span className="text-amber-500 font-medium">{a.giftName}</span>
                      {' '}· <span className="text-amber-400">{a.coins} {t('common.coins')}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Live chat sidebar (desktop) / below video (mobile) */}
          {isLive && stream.playbackUrl && features.liveChat && (
            <div className="flex w-full lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-[var(--border)] bg-[var(--bg-elevated)] flex-col max-h-[40vh] lg:max-h-none h-full">
              {React.createElement(
                require('../components/LiveChat').LiveChat,
                {
                  streamId: String(stream._id || streamId),
                  className: 'h-full rounded-none border-0',
                  onProductDrop: (msg) => setProductDrop(msg),
                  onAuctionStarted: () => setAuctionRefresh((n) => n + 1),
                  onGiftReceived: features.liveGifts ? handleGiftReceived : undefined,
                  onSendGiftReady: features.liveGifts ? setSendGiftViaWs : undefined,
                  onReactionBurst: (msg) => setReactionBursts((b) => [...b.slice(-19), msg]),
                  onModerationState: setModerationState,
                  isModerator: !!me && !!creatorId && String(me._id) === String(creatorId),
                  moderationState,
                }
              )}
            </div>
          )}
        </div>
      </div>

      {/* Gift panel */}
      {giftOpen && features.liveGifts && (
        <GiftPanel
          receiverId={creatorId}
          streamId={String(stream._id || streamId)}
          onSend={handleSendGift}
          onClose={() => setGiftOpen(false)}
          sendGiftViaWs={sendGiftViaWs}
          giftsBlocked={moderationState.giftsBlocked}
        />
      )}

      {/* Report modal */}
      {reportOpen && (
        <ReportModal
          targetId={String(stream._id || streamId)}
          targetType="stream"
          onClose={() => setReportOpen(false)}
        />
      )}
    </>
  );
}
