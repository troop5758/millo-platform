import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import {
  IconUsers, IconUserPlus, IconStarSolid, IconVideo,
  IconMail, IconMoreHoriz, IconTrophy, IconEye, IconLive,
} from '../components/Icons';
import { fetchCreator, followUser, unfollowUser, blockUser, unblockUser, requestCall } from '../sdk/contentApi';
import { getUser } from '../sdk/authApi';
import { ReportModal } from '../components/ReportModal';

function fmt(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function useTimeAgo() {
  const { t } = useTranslation();
  return function timeAgo(date) {
    if (!date) return '';
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60)    return t('common.timeAgo.justNow');
    if (s < 3600)  return t('common.timeAgo.minutesAgo', { count: Math.floor(s / 60) });
    if (s < 86400) return t('common.timeAgo.hoursAgo',   { count: Math.floor(s / 3600) });
    return t('common.timeAgo.daysAgo', { count: Math.floor(s / 86400) });
  };
}


export function CreatorPage() {
  const { t }    = useTranslation();
  const timeAgo  = useTimeAgo();
  const { id }   = useParams();
  const navigate = useNavigate();
  const me       = getUser();

  const [creator,    setCreator]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState('Videos');
  const [following,  setFollowing]  = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followErr,  setFollowErr]  = useState('');
  const [moreOpen,   setMoreOpen]   = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blocked,    setBlocked]    = useState(false);
  const [blockBusy,  setBlockBusy]  = useState(false);
  const [blockErr,   setBlockErr]   = useState('');
  const [callBusy,   setCallBusy]   = useState(false);
  const [callErr,    setCallErr]    = useState('');
  const moreRef = useRef(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchCreator(id)
      .then((c) => {
        setCreator(c);
        setFollowing(c?.isFollowing ?? false);
        setBlocked(c?.isBlocked ?? false);
      })
      .catch(() => setCreator(null))
      .finally(() => setLoading(false));
  }, [id]);

  const handleFollow = async () => {
    if (!me) { navigate('/login'); return; }
    if (followBusy) return;
    setFollowBusy(true);
    setFollowErr('');
    try {
      if (following) {
        await unfollowUser(id);
        setFollowing(false);
        setCreator((c) => c ? { ...c, followers: Math.max(0, (c.followers || 0) - 1) } : c);
      } else {
        await followUser(id);
        setFollowing(true);
        setCreator((c) => c ? { ...c, followers: (c.followers || 0) + 1 } : c);
      }
    } catch (e) {
      setFollowErr(e.message || t('common.error'));
      setTimeout(() => setFollowErr(''), 4000);
    }
    setFollowBusy(false);
  };

  const handleBlock = async () => {
    if (!me) { navigate('/login'); return; }
    if (blockBusy) return;
    setBlockBusy(true);
    setMoreOpen(false);
    setBlockErr('');
    try {
      if (blocked) {
        await unblockUser(id);
      } else {
        await blockUser(id);
      }
      setBlocked((b) => !b);
    } catch (e) {
      setBlockErr(e.message || t('common.error'));
      setTimeout(() => setBlockErr(''), 4000);
    }
    setBlockBusy(false);
  };

  const handleRequestCall = async () => {
    if (!me) { navigate('/login'); return; }
    if (String(id) === String(me.id || me._id)) return;
    if (callBusy) return;
    setCallBusy(true);
    setCallErr('');
    try {
      const { session } = await requestCall(id);
      navigate(`/calls`);
    } catch (e) {
      setCallErr(e.message || e.data?.message || t('common.error'));
      setTimeout(() => setCallErr(''), 4000);
    }
    setCallBusy(false);
  };

  if (loading) return (
    <div className="max-w-6xl mx-auto px-4 py-16 flex justify-center">
      <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!creator) return (
    <div className="max-w-6xl mx-auto px-4 py-20 text-center text-[var(--text-muted)]">
      <p className="text-lg font-medium">{t('creator.notFound')}</p>
      <Link to="/feed" className="mt-4 inline-block text-[var(--accent)] text-sm">{t('creator.browse')}</Link>
    </div>
  );

  const handle      = creator.username || creator.handle || id;
  const displayName = creator.displayName || handle;
  const streams     = creator.streams || [];
  const eventReplays = creator.eventReplays || [];
  const upcomingEvents = creator.upcomingEvents || [];
  const allVideos   = [...streams, ...eventReplays].sort(
    (a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0)
  );
  const liveStream  = streams.find((s) => s.status === 'live');

  const TABS_TRANSLATED = [
    { key: 'Videos',    label: t('creator.tabVideos') },
    { key: 'Exclusive', label: t('creator.tabExclusive') },
    { key: 'Messages',  label: t('creator.tabMessages') },
    { key: 'About',     label: t('creator.tabAbout') },
  ];

  const STATS = [
    { label: t('creator.followers'),   value: fmt(creator.followers),   Icon: IconUsers },
    { label: t('creator.following'),   value: fmt(creator.following),   Icon: IconUserPlus },
    { label: t('creator.subscribers'), value: fmt(creator.subscribers), Icon: IconStarSolid, accent: true },
    { label: t('creator.streams'),     value: fmt(streams.length),      Icon: IconVideo },
  ];

  return (
    <>
      <SEO
        title={`${displayName} – Millo`}
        description={`${displayName}'s creator profile on Millo.`}
        path={`/creator/${id}`}
        image={creator.avatarUrl || undefined}
      />
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Top bar */}
        <div className="flex justify-between items-center mb-6">
          <span className="text-sm text-[var(--text)] bg-[var(--bg-elevated)] px-3 py-1.5 rounded-lg border border-[var(--border)]">
            @{handle}
          </span>
          {liveStream && (
            <Link to="/live" className="flex items-center gap-2 text-sm font-semibold text-red-500 bg-red-500/10 px-3 py-1.5 rounded-lg animate-pulse">
              <IconLive className="w-3.5 h-3.5" />
              {t('creator.liveNow')}
            </Link>
          )}
        </div>

        {/* Profile header */}
        <div className="flex gap-6 flex-wrap">
          <div className="w-24 h-24 rounded-full bg-[var(--muted)] shrink-0 overflow-hidden flex items-center justify-center">
            {creator.avatarUrl
              ? <img src={creator.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
              : <IconUsers className="w-10 h-10 text-[var(--bg-elevated)]" />}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text)]">{displayName}</h1>
            <p className="text-[var(--text-muted)] mt-0.5">@{handle}</p>
            {creator.isPremium && (
              <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-md text-xs font-semibold bg-[var(--accent-premium)] text-white">
                <IconTrophy className="w-3 h-3" />
                PREMIUM
              </span>
            )}
            {creator.bio && (
              <p className="text-sm text-[var(--text-muted)] mt-2 max-w-lg">{creator.bio}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-4">
              <button
                type="button"
                onClick={handleFollow}
                disabled={followBusy}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  following
                    ? 'border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] hover:bg-red-50 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-500/10'
                    : 'bg-[var(--accent)] text-white border-transparent hover:bg-[var(--accent-hover)]'
                }`}
              >
                {followBusy ? '…' : following ? t('common.following') : t('common.follow')}
              </button>
              <Link
                to={me ? `/messages?user=${id}` : '/login'}
                className="px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] text-sm font-medium flex items-center gap-1.5 hover:bg-[var(--bg-card)] transition-colors">
                <IconMail className="w-3.5 h-3.5" />
                {t('common.message')}
              </Link>
              {me && String(id) !== String(me.id || me._id) && (
                <button
                  type="button"
                  onClick={handleRequestCall}
                  disabled={callBusy}
                  className="px-4 py-2 rounded-lg border border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent)] text-sm font-medium flex items-center gap-1.5 hover:bg-[var(--accent)] hover:text-white transition-colors disabled:opacity-50"
                >
                  <IconVideo className="w-3.5 h-3.5" />
                  {callBusy ? '…' : t('calls.requestCall')}
                </button>
              )}
              <div className="relative" ref={moreRef}>
                <button type="button"
                  onClick={() => setMoreOpen((o) => !o)}
                  className="w-10 h-10 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)] flex items-center justify-center hover:text-[var(--text)] transition-colors"
                  aria-label="More options">
                  <IconMoreHoriz className="w-4 h-4" />
                </button>
                {moreOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                    <div className="absolute right-0 top-12 z-50 w-44 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl overflow-hidden">
                      <button type="button"
                        onClick={() => { setMoreOpen(false); setReportOpen(true); }}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-red-500 hover:bg-red-500/5 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                        </svg>
                        {t('creator.report')}
                      </button>
                      <button type="button"
                        onClick={handleBlock}
                        disabled={blockBusy}
                        className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                        {blocked ? t('creator.unblock') : t('creator.block')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
          {STATS.map((s) => {
            const isFollowStat = s.label === t('creator.followers') || s.label === t('creator.following');
            const followType = s.label === t('creator.followers') ? 'followers' : 'following';
            const hasCount = (s.label === t('creator.followers') && (creator.followers || 0) > 0) ||
              (s.label === t('creator.following') && (creator.following || 0) > 0);
            const Wrapper = isFollowStat && hasCount ? Link : 'div';
            const wrapperProps = isFollowStat && hasCount ? { to: `/creator/${id}/${followType}` } : {};
            return (
              <Wrapper key={s.label} {...wrapperProps} className={'rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center ' + (isFollowStat && hasCount ? 'hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer' : '')}>
                <div className="flex items-center justify-center gap-1.5">
                  <s.Icon className={'w-4 h-4 ' + (s.accent ? 'text-[var(--accent-premium)]' : 'text-[var(--text-muted)]')} />
                  <p className="text-xl sm:text-2xl font-bold text-[var(--text)]">{s.value}</p>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">{s.label}</p>
              </Wrapper>
            );
          })}
        </div>

        {/* Follow/Block error toasts */}
        {(followErr || blockErr) && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>{followErr || blockErr}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-6 border-b border-[var(--border)] mt-8 overflow-x-auto">
          {TABS_TRANSLATED.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={'shrink-0 pb-3 font-medium text-sm ' +
                (tab === key
                  ? 'text-[var(--accent-premium)] border-b-2 border-[var(--accent-premium)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]')}>
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'Videos' && (
          <>
            {upcomingEvents.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-3">
                  {t('creator.upcomingEvents', { defaultValue: 'Upcoming Events' })}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {upcomingEvents.map((e) => (
                    <Link key={e.id || e._id} to={`/live/events/${e.id || e._id}`}
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden hover:border-[var(--accent)] transition-colors">
                      <div className="aspect-video bg-[var(--bg-elevated)] flex items-center justify-center relative">
                        {e.thumbnailUrl
                          ? <img src={e.thumbnailUrl} alt={e.title} className="w-full h-full object-cover" />
                          : <IconVideo className="w-8 h-8 text-[var(--muted)]" />}
                        <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white">
                          {t('live.scheduled')}
                        </span>
                      </div>
                      <p className="p-3 text-sm font-semibold text-[var(--text)] truncate">{e.title || t('eventCountdown.title', { defaultValue: 'Live Event' })}</p>
                      <p className="px-3 pb-3 text-xs text-[var(--text-muted)]">
                        {e.scheduledStart ? new Date(e.scheduledStart).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {allVideos.length === 0
              ? <p className="mt-10 text-center text-[var(--text-muted)] text-sm">{t('creator.noStreams')}</p>
              : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                  {allVideos.map((s) => (
                    <Link key={s.id || s._id} to={s.status === 'live' ? `/live/${s.id || s._id}` : `/creator/${id}/replays/${s.id || s._id}`}
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden hover:border-[var(--accent)] transition-colors">
                      <div className="aspect-video bg-[var(--bg-elevated)] flex items-center justify-center relative">
                        <IconVideo className="w-8 h-8 text-[var(--muted)]" />
                        {s.status === 'live' && (
                          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white">LIVE</span>
                        )}
                        {s.viewers > 0 && (
                          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs text-white">
                            <IconEye className="w-3 h-3" />{fmt(s.viewers)}
                          </span>
                        )}
                      </div>
                      <p className="p-3 text-sm font-semibold text-[var(--text)] truncate">{s.title || 'Untitled stream'}</p>
                      <p className="px-3 pb-3 text-xs text-[var(--text-muted)]">{timeAgo(s.startedAt)}</p>
                    </Link>
                  ))}
                </div>
              )
            }
          </>
        )}

        {tab === 'Messages' && (
          <div className="mt-8 text-center">
            <Link to={me ? `/messages?user=${id}` : '/login'}
              className="btn-primary inline-flex items-center gap-2 px-6 py-3">
              <IconMail className="w-4 h-4" />
              {t('creator.openConversation')}
            </Link>
          </div>
        )}

        {tab === 'About' && (
          <div className="mt-8 max-w-lg">
            <dl className="space-y-4">
              {creator.bio && (
                <div>
                  <dt className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">{t('creator.bio')}</dt>
                  <dd className="text-sm text-[var(--text)]">{creator.bio}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-1">{t('creator.handle')}</dt>
                <dd className="text-sm text-[var(--text)]">@{handle}</dd>
              </div>
            </dl>
          </div>
        )}

        {tab === 'Exclusive' && (
          <div className="mt-8">
            {creator?.isSubscribed ? (
              <>
                {/* Subscriber-only replays */}
                {streams.filter((s) => s.status === 'ended' && s.recordingUrl).length > 0 ? (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {streams.filter((s) => s.status === 'ended' && s.recordingUrl).map((s) => (
                      <Link
                        key={String(s._id)}
                        to={`/creator/${id}/replays/${s._id}`}
                        className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden hover:shadow-md transition-shadow group block"
                      >
                        <div className="relative aspect-video bg-[var(--bg-elevated)] overflow-hidden">
                          {s.thumbnailUrl
                            ? <img src={s.thumbnailUrl} alt={s.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            : <div className="w-full h-full flex items-center justify-center">
                                <IconVideo className="w-10 h-10 text-[var(--text-muted)] opacity-30" />
                              </div>}
                          <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--accent-premium)] text-white text-xs font-bold">
                            <IconStarSolid className="w-3 h-3" /> Exclusive
                          </span>
                        </div>
                        <div className="p-3">
                          <p className="font-semibold text-[var(--text)] text-sm truncate">{s.title || 'Replay'}</p>
                          {s.startedAt && (
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">{timeAgo(s.startedAt)}</p>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="py-20 text-center">
                    <IconVideo className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3 opacity-40" />
                    <p className="text-[var(--text)] font-semibold">{t('creator.isSubscriber')}</p>
                    <p className="text-sm text-[var(--text-muted)] mt-1">
                      {t('creator.exclusiveComingSoon', { name: creator.displayName || t('creator.thisCreator') })}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="py-20 text-center max-w-sm mx-auto">
                <div className="w-16 h-16 rounded-full bg-[var(--accent-premium)]/10 flex items-center justify-center mx-auto mb-4">
                  <IconStarSolid className="w-8 h-8 text-[var(--accent-premium)]" />
                </div>
                <p className="font-bold text-[var(--text)] text-lg">{t('creator.subscriberOnly')}</p>
                <p className="text-sm text-[var(--text-muted)] mt-2 leading-relaxed">
                  {t('creator.subscriberOnlyDesc', { name: creator.displayName || t('creator.thisCreator') })}
                </p>
                <Link
                  to={me ? `/subscribe/${id}` : '/login'}
                  className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[var(--accent-premium)] text-white text-sm font-semibold hover:opacity-90 transition-opacity">
                  <IconStarSolid className="w-4 h-4" />
                  {t('creator.subscribeToUnlock')}
                </Link>
              </div>
            )}
          </div>
        )}

        <div className="mt-8">
          <Link to={`/creator/${id}/shop`} className="btn-primary inline-flex items-center gap-2">
            {t('creator.viewShop')}
          </Link>
        </div>
      </div>

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="user"
        targetId={String(creator._id || id)}
        targetLabel={`@${creator.handle || creator.displayName || id}`}
      />
    </>
  );
}
