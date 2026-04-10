/**
 * Followers / Following page — view and manage social graph.
 * Routes: /creator/:id/followers, /creator/:id/following
 * When id is "me", uses current user (requires login).
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { getUser } from '../sdk/authApi';
import { fetchCreator, fetchFollowers, fetchFollowing, followUser, unfollowUser } from '../sdk/contentApi';

const PAGE_SIZE = 50;

function getUserId(item, type) {
  return type === 'followers' ? item.followerId?._id : item.followingId?._id;
}

function getDisplayName(item, type) {
  const u = type === 'followers' ? item.followerId : item.followingId;
  return item.displayName || u?.email?.split('@')[0] || 'User';
}

export function FollowersFollowingPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const type = pathname.endsWith('/following') ? 'following' : 'followers';
  const me = getUser();
  const isMe = id === 'me';

  const [creator, setCreator] = useState(null);
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [followState, setFollowState] = useState({});

  const tab = type === 'following' ? 'following' : 'followers';
  const hasMore = list.length < total;

  useEffect(() => {
    if (!id) return;
    if (isMe && !me) {
      navigate('/login');
      return;
    }
    setLoading(true);
    setError('');
    (async () => {
      try {
        let creatorData;
        let userId;
        if (isMe) {
          userId = me.id;
          creatorData = { id: userId, displayName: me?.displayName || me?.name, username: me?.username };
        } else {
          creatorData = await fetchCreator(id);
          userId = creatorData?.id || id;
        }
        const data = tab === 'followers'
          ? await fetchFollowers(userId, PAGE_SIZE, 0)
          : await fetchFollowing(userId, PAGE_SIZE, 0);
        setCreator(creatorData);
        setList(tab === 'followers' ? (data.followers || []) : (data.following || []));
        setTotal(data.total ?? 0);
        setOffset((tab === 'followers' ? (data.followers || []) : (data.following || [])).length);
      } catch (e) {
        setError(e.message || t('profilePage.loadError'));
        setCreator(null);
        setList([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, tab, isMe, me?.id]);

  const loadMore = async () => {
    if (!creator || loadingMore || !hasMore) return;
    const userId = isMe ? me.id : creator.id;
    setLoadingMore(true);
    try {
      const data = tab === 'followers'
        ? await fetchFollowers(userId, PAGE_SIZE, offset)
        : await fetchFollowing(userId, PAGE_SIZE, offset);
      const next = tab === 'followers' ? (data.followers || []) : (data.following || []);
      setList((prev) => [...prev, ...next]);
      setOffset((o) => o + next.length);
    } catch { /* ignore */ }
    setLoadingMore(false);
  };

  const handleFollow = async (targetId, currentlyFollowing) => {
    if (!me) { navigate('/login'); return; }
    const prev = followState[targetId];
    setFollowState((s) => ({ ...s, [targetId]: currentlyFollowing ? 'unfollowing' : 'following' }));
    try {
      if (currentlyFollowing) {
        await unfollowUser(targetId);
        setFollowState((s) => ({ ...s, [targetId]: false }));
      } else {
        await followUser(targetId);
        setFollowState((s) => ({ ...s, [targetId]: true }));
      }
    } catch {
      setFollowState((s) => ({ ...s, [targetId]: prev }));
    }
  };

  const displayName = creator?.displayName || (isMe ? me?.displayName || me?.name : '');
  const username = creator?.username || (isMe ? me?.username : '');
  const backUrl = isMe ? '/profile' : (username ? `/creator/${username}` : '/feed');
  const title = tab === 'followers' ? t('profilePage.followers') : t('profilePage.following');

  return (
    <>
      <SEO title={`${title} — ${displayName || 'Millo'}`} path={`/creator/${id}/${tab}`} />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="mb-6">
          <Link to={backUrl} className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
            ← {t('common.back')}
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-[var(--text)] mb-1">
          {displayName || (isMe ? t('profilePage.seoTitle', 'My Profile') : '…')} — {title}
        </h1>
        {username && <p className="text-sm text-[var(--text-muted)] mb-6">@{username}</p>}

        {error && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <p className="text-center text-[var(--text-muted)] py-12">{t('profilePage.noFollowList', 'No one yet')}</p>
        ) : (
          <ul className="space-y-2">
            {list.map((item) => {
              const uid = getUserId(item, tab);
              const name = getDisplayName(item, tab);
              const uname = item.username;
              const isFollowing = tab === 'following' ? true : (item.isFollowing ?? followState[uid]);
              const busy = followState[uid] === 'following' || followState[uid] === 'unfollowing';
              const isOwn = me?.id && String(uid) === String(me.id);

              return (
                <li key={uid || item._id} className="flex items-center justify-between gap-4 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)]">
                  <Link to={uname ? `/creator/${uname}` : '#'} className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-full bg-[var(--accent)] overflow-hidden flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {item.avatarUrl ? (
                        <img src={item.avatarUrl} alt={name} className="w-full h-full object-cover" />
                      ) : (
                        name.slice(0, 2).toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--text)] truncate">{name}</p>
                      {uname && <p className="text-xs text-[var(--text-muted)]">@{uname}</p>}
                    </div>
                  </Link>
                  {me && !isOwn && (
                    <button
                      type="button"
                      onClick={() => handleFollow(uid, isFollowing)}
                      disabled={busy}
                      className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                        isFollowing
                          ? 'border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]'
                          : 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
                      }`}
                    >
                      {busy ? '…' : isFollowing ? t('common.following') : t('common.follow')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {hasMore && !loading && (
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="px-6 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text)] font-medium hover:bg-[var(--bg-elevated)] disabled:opacity-50"
            >
              {loadingMore ? '…' : t('feed.loadMore', 'Load more')}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
