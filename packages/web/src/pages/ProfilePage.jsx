/**
 * My profile — current user's profile with real analytics, edit modal, live streams.
 * https://milloapp.com
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import {
  IconUsers, IconUserPlus, IconStarSolid, IconVideo,
  IconHash, IconTrophy, IconEdit, IconEye,
} from '../components/Icons';
import { getUser } from '../sdk/authApi';
import { fetchMyAnalytics, updateProfile, fetchMySubscriptions, cancelSubscription, fetchPayoutHistory, requestPayout, fetchWallet } from '../sdk/contentApi';

const TAB_KEYS = ['streams', 'analytics', 'wallet', 'settings'];


function fmtNum(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000)    return (n / 1000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}
function fmtCents(c) {
  if (!c) return '$0.00';
  return '$' + (c / 100).toFixed(2);
}

export function ProfilePage() {
  const [tab,       setTab]     = useState('streams');
  const [analytics, setAnal]   = useState(null);
  const [loading,   setLoading]= useState(true);
  const [editing,   setEditing]= useState(false);
  const [editForm,  setEditForm]= useState({});
  const [saveMsg,   setSaveMsg]= useState('');
  const [subs,      setSubs]   = useState([]);
  const [payouts,   setPayouts]= useState([]);
  const [wallet,    setWallet] = useState(null);
  const [payoutAmt,  setPayoutAmt]  = useState('');
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutMsg,  setPayoutMsg]  = useState('');
  const [subError,   setSubError]   = useState('');
  const [dataError,  setDataError]  = useState('');

  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getUser();
  const TABS = TAB_KEYS.map((k) => ({ key: k, label: t(`profilePage.tabs.${k}`) }));
  const isLoggedIn = !!user;

  const displayName = user?.displayName || user?.name || 'Millo Creator';
  const handle      = user?.username || user?.id || 'millocreator';

  useEffect(() => {
    if (!isLoggedIn) { setLoading(false); return; }
    fetchMyAnalytics()
      .then((a) => setAnal(a))
      .catch(() => setDataError(t('profilePage.loadError')))
      .finally(() => setLoading(false));
    fetchMySubscriptions()
      .then(setSubs)
      .catch(() => setDataError(t('profilePage.loadError')));
    fetchPayoutHistory()
      .then(setPayouts)
      .catch(() => setDataError(t('profilePage.loadError')));
    fetchWallet()
      .then(setWallet)
      .catch(() => setDataError(t('profilePage.loadError')));
  }, [isLoggedIn]);

  const handleRequestPayout = async () => {
    const cents = Math.round(parseFloat(payoutAmt) * 100);
    if (!cents || cents < 500) { setPayoutMsg(t('profilePage.payoutMinError')); return; }
    setPayoutBusy(true); setPayoutMsg('');
    try {
              const res = await requestPayout(cents);
      setPayoutMsg(t('profilePage.payoutRequested', { amount: (cents / 100).toFixed(2), balance: ((res.newBalance || 0) / 100).toFixed(2) }));
      setWallet((w) => ({ ...w, balanceCents: res.newBalance }));
      setPayouts((p) => [res.payout, ...p]);
      setPayoutAmt('');
    } catch (e) {
      setPayoutMsg(e.message || t('profilePage.payoutFailed'));
    }
    setPayoutBusy(false);
  };

  const STATS = [
    { label: t('profilePage.followers'),   value: fmtNum(analytics?.followers),          Icon: IconUsers },
    { label: t('profilePage.following'),   value: fmtNum(analytics?.following),           Icon: IconUserPlus },
    { label: t('profilePage.subscribers'), value: fmtNum(analytics?.subscribers),         Icon: IconStarSolid, accent: true },
    { label: t('profilePage.streams'),     value: fmtNum(analytics?.streams?.total),      Icon: IconVideo },
    { label: t('profilePage.revenue30d'),  value: fmtCents(analytics?.revenue30dCents),   Icon: IconHash },
  ];

  const goToFollowPage = (modalType) => {
    if (user?.id) navigate(`/creator/me/${modalType}`);
  };

  async function handleSave(e) {
    e.preventDefault();
    try {
      await updateProfile(editForm);
      const { fetchMe } = await import('../sdk/authApi');
      await fetchMe();
      setSaveMsg(t('profilePage.profileUpdated'));
      setTimeout(() => { setSaveMsg(''); setEditing(false); }, 1500);
    } catch {
      setSaveMsg(t('profilePage.saveFailed'));
    }
  }

  return (
    <>
      <SEO title={t('profilePage.seoTitle')} description={t('profilePage.seoDesc')} path="/profile" />
      <div className="max-w-6xl mx-auto px-4 py-6">
        {!isLoggedIn && (
          <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-[var(--text-muted)]">{t('profilePage.notLoggedIn')}</span>
            <Link to="/login" className="text-sm font-medium text-[var(--accent)] hover:underline">{t('profilePage.signIn')}</Link>
          </div>
        )}

        {dataError && (
          <div role="alert" className="mb-4 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
            <span>{dataError}</span>
            <button onClick={() => setDataError('')} className="text-red-500 hover:text-red-700 font-medium text-xs">✕</button>
          </div>
        )}

        {/* Edit profile modal */}
        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-[var(--bg-elevated)] rounded-2xl p-6 shadow-2xl border border-[var(--border)]">
              <h2 className="text-lg font-bold text-[var(--text)] mb-4">{t('profilePage.editProfileTitle')}</h2>
              <form onSubmit={handleSave} className="space-y-3">
                {[
                  { id: 'displayName', label: t('profilePage.fieldDisplayName'), placeholder: displayName },
                  { id: 'username',    label: t('profilePage.fieldUsername'),     placeholder: handle },
                  { id: 'bio',         label: t('profilePage.fieldBio'),          placeholder: t('profilePage.fieldBioPlaceholder'), multiline: true },
                  { id: 'avatarUrl',   label: t('profilePage.fieldAvatarUrl'),    placeholder: 'https://…' },
                ].map(({ id, label, placeholder, multiline }) => (
                  <div key={id}>
                    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{label}</label>
                    {multiline
                      ? <textarea rows={3} placeholder={placeholder}
                          value={editForm[id] ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, [id]: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none" />
                      : <input type="text" placeholder={placeholder}
                          value={editForm[id] ?? ''} onChange={(e) => setEditForm((f) => ({ ...f, [id]: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                    }
                  </div>
                ))}
                {saveMsg && <p className={`text-sm ${saveMsg.includes('failed') ? 'text-red-500' : 'text-emerald-500'}`}>{saveMsg}</p>}
                <div className="flex gap-2 pt-1">
                  <button type="submit" className="btn-primary flex-1 py-2">{t('common.save')}</button>
                  <button type="button" onClick={() => setEditing(false)} className="flex-1 py-2 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-card)]">{t('common.cancel')}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Handle + edit */}
        <div className="flex justify-between items-center mb-6">
          <span className="text-sm text-[var(--text)] bg-[var(--bg-elevated)] px-3 py-1.5 rounded-lg border border-[var(--border)]">@{handle}</span>
          {isLoggedIn && (
            <button type="button" onClick={() => { setEditForm({ displayName, username: handle, bio: user?.bio || '', avatarUrl: user?.avatarUrl || '' }); setEditing(true); }}
              className="text-sm flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
              <IconEdit className="w-4 h-4" /> {t('profilePage.editProfile')}
            </button>
          )}
        </div>

        {/* Avatar + name */}
        <div className="flex gap-6 flex-wrap">
          <div className="w-24 h-24 rounded-full bg-[var(--muted)] shrink-0 overflow-hidden">
            {user?.avatarUrl
              ? <img src={user.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"><IconUsers className="w-10 h-10 text-[var(--bg-elevated)]" /></div>
            }
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text)]">{displayName}</h1>
            <p className="text-[var(--text-muted)] mt-0.5">@{handle}</p>
            {user?.bio && <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-md">{user.bio}</p>}
            <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-md text-xs font-semibold bg-[var(--accent-premium)] text-white">
              <IconTrophy className="w-3 h-3" /> CREATOR
            </span>
            <div className="flex flex-wrap gap-2 mt-4">
              <button type="button" onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors">
                <IconEdit className="w-3.5 h-3.5" /> {t('profilePage.editProfile')}
              </button>
              <Link to={'/creator/' + handle}
                className="px-4 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)] text-sm font-medium hover:bg-[var(--bg-card)] transition-colors">
                {t('profilePage.viewPublicPage')}
              </Link>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-8">
          {STATS.map((s) => {
            const isClickable = (s.label === t('profilePage.followers') || s.label === t('profilePage.following')) && isLoggedIn && (analytics?.followers > 0 || analytics?.following > 0);
            return (
              <div
                key={s.label}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onClick={isClickable ? () => goToFollowPage(s.label === t('profilePage.followers') ? 'followers' : 'following') : undefined}
                onKeyDown={isClickable ? (e) => e.key === 'Enter' && goToFollowPage(s.label === t('profilePage.followers') ? 'followers' : 'following') : undefined}
                className={'rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center ' + (isClickable ? 'cursor-pointer hover:bg-[var(--bg-elevated)] transition-colors' : '')}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <s.Icon className={'w-4 h-4 ' + (s.accent ? 'text-[var(--accent-premium)]' : 'text-[var(--text-muted)]')} />
                  <p className="text-xl sm:text-2xl font-bold text-[var(--text)]">
                    {loading ? <span className="inline-block w-10 h-6 bg-[var(--bg-elevated)] rounded animate-pulse" /> : s.value}
                  </p>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">{s.label}</p>
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-[var(--border)] mt-8 overflow-x-auto">
          {TABS.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={'shrink-0 pb-3 font-medium text-sm ' +
                (tab === key ? 'text-[var(--accent-premium)] border-b-2 border-[var(--accent-premium)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]')}>
              {label}
            </button>
          ))}
        </div>

        {/* Streams tab */}
        {tab === 'streams' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
            {(analytics?.streams?.recent || []).map((s) => (
              <div key={s.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
                <div className="aspect-video bg-[var(--bg-elevated)] flex items-center justify-center relative">
                  {s.thumbnailUrl ? <img src={s.thumbnailUrl} alt={s.title} className="w-full h-full object-cover" /> : <IconVideo className="w-8 h-8 text-[var(--muted)]" />}
                  {s.status === 'live' && <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold">{t('common.live')}</span>}
                  <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs text-white">
                    <IconEye className="w-3 h-3" />{fmtNum(s.viewers)}
                  </span>
                </div>
                <p className="p-3 text-sm font-semibold text-[var(--text)] truncate">{s.title || 'Stream'}</p>
              </div>
            ))}
            {(!analytics || !analytics.streams?.recent?.length) && !loading && (
              <div className="col-span-4 py-12 text-center text-[var(--text-muted)] text-sm">{t('profilePage.noStreams')}</div>
            )}
          </div>
        )}

        {/* Analytics tab */}
        {tab === 'analytics' && (
          <div className="mt-6 space-y-6">
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { label: t('profilePage.revenue30d'),  value: fmtCents(analytics?.revenue30dCents) },
                { label: t('profilePage.newFollowers7d'), value: fmtNum(analytics?.newFollowers7d) },
                { label: t('profilePage.balance'),     value: fmtCents(analytics?.balanceCents) },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                  <p className="text-sm text-[var(--text-muted)]">{label}</p>
                  <p className="text-2xl font-bold text-[var(--text)] mt-1">{loading ? '…' : value}</p>
                </div>
              ))}
            </div>
            {/* Revenue chart */}
            {analytics?.revenueChart && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <p className="text-sm font-semibold text-[var(--text)] mb-4">{t('profilePage.revenueLast30d')}</p>
                <div className="flex items-end gap-1 h-24">
                  {analytics.revenueChart.map((d, i) => {
                    const max = Math.max(...analytics.revenueChart.map((x) => x.revenue), 1);
                    const h   = Math.max(2, (d.revenue / max) * 100);
                    return (
                      <div key={i} title={`${d.date}: ${fmtCents(d.revenue)}`}
                        className="flex-1 bg-[var(--accent)] rounded-t opacity-80 hover:opacity-100 transition-opacity"
                        style={{ height: `${h}%` }} />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Wallet tab */}
        {tab === 'wallet' && (
          <div className="mt-6 space-y-6 max-w-2xl">
            {/* Balance + payout */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-[var(--text-muted)]">{t('profilePage.availableBalance')}</p>
                  <p className="text-3xl font-extrabold text-amber-500 mt-0.5">
                    {fmtCents(wallet?.balanceCents ?? analytics?.balanceCents ?? 0)}
                  </p>
                </div>
                <Link to="/coins" className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500 text-sm font-semibold hover:bg-amber-500/15 transition-colors">
                  {t('profilePage.buyCoins')}
                </Link>
              </div>
              <hr className="border-[var(--border)] mb-4" />
              <h4 className="text-sm font-semibold text-[var(--text)] mb-3">{t('profilePage.requestPayout')}</h4>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm">$</span>
                  <input type="number" min="5" step="0.01" placeholder="5.00"
                    value={payoutAmt}
                    onChange={(e) => setPayoutAmt(e.target.value)}
                    className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
                <button type="button" onClick={handleRequestPayout} disabled={payoutBusy || !payoutAmt}
                  className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
                  {payoutBusy ? '…' : t('profilePage.request')}
                </button>
              </div>
              {payoutMsg && (
                <p className={`text-sm mt-2 ${payoutMsg.includes('failed') || payoutMsg.includes('Minimum') ? 'text-red-500' : 'text-emerald-500'}`}>
                  {payoutMsg}
                </p>
              )}
              <p className="text-xs text-[var(--text-muted)] mt-2">{t('profilePage.payoutNote')}</p>
            </div>

            {/* Subscriptions */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h4 className="text-sm font-semibold text-[var(--text)] mb-3">{t('profilePage.mySubscriptions')}</h4>
              {subError && (
                <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600 flex items-center justify-between">
                  <span>{subError}</span>
                  <button type="button" onClick={() => setSubError('')} className="ml-2 text-red-400 hover:text-red-600">✕</button>
                </div>
              )}
              {subs.length === 0
                ? <p className="text-sm text-[var(--text-muted)]">{t('profilePage.noSubs')} <Link to="/pricing" className="text-[var(--accent)] hover:underline">{t('profilePage.viewPlans')}</Link></p>
                : subs.map((s) => (
                  <div key={s._id} className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)] capitalize">{s.plan}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {t('profilePage.status')}: <span className={s.status === 'active' ? 'text-emerald-500' : 'text-red-400'}>{s.status}</span>
                        {s.endsAt && ` · ${t('profilePage.ends')} ${new Date(s.endsAt).toLocaleDateString()}`}
                      </p>
                    </div>
                    {s.status === 'active' && (
                      <button type="button"
                        onClick={async () => {
                          setSubError('');
                          try { await cancelSubscription(s._id); setSubs((prev) => prev.map((x) => x._id === s._id ? { ...x, status: 'cancelled' } : x)); }
                          catch (e) { setSubError(e.message || t('profilePage.cancelSubErr')); }
                        }}
                        className="text-xs text-red-500 hover:underline">
                        {t('profilePage.cancel')}
                      </button>
                    )}
                  </div>
                ))
              }
            </div>

            {/* Payout history */}
            {payouts.length > 0 && (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h4 className="text-sm font-semibold text-[var(--text)] mb-3">{t('profilePage.payoutHistory')}</h4>
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-[var(--text-muted)] text-left border-b border-[var(--border)]">
                    <th className="pb-2">{t('profilePage.date')}</th><th className="pb-2">{t('profilePage.amount')}</th><th className="pb-2">{t('profilePage.provider')}</th><th className="pb-2">{t('profilePage.statusCol')}</th>
                  </tr></thead>
                  <tbody>
                    {payouts.map((p) => (
                      <tr key={p._id} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-2 text-[var(--text-muted)] text-xs">{new Date(p.createdAt).toLocaleDateString()}</td>
                        <td className="py-2 font-semibold text-[var(--text)]">{fmtCents(p.amountCents)}</td>
                        <td className="py-2 text-[var(--text-muted)] capitalize">{p.provider}</td>
                        <td className="py-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            p.status === 'paid'    ? 'bg-emerald-500/10 text-emerald-500'
                            : p.status === 'pending' ? 'bg-amber-500/10 text-amber-500'
                            : p.status === 'rejected'? 'bg-red-500/10 text-red-500'
                            : 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                          }`}>{p.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Settings tab */}
        {tab === 'settings' && (
          <div className="mt-6 max-w-md space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h3 className="font-semibold text-[var(--text)] mb-1">{t('profilePage.account')}</h3>
              <p className="text-sm text-[var(--text-muted)]">{user?.email}</p>
              <div className="mt-3 flex gap-3">
                <button type="button" onClick={() => { setEditForm({ displayName, username: handle, bio: user?.bio || '', avatarUrl: user?.avatarUrl || '' }); setEditing(true); }}
                  className="text-sm text-[var(--accent)] hover:underline">
                  {t('profilePage.editProfile')}
                </button>
                <Link to="/profile/edit" className="text-sm text-[var(--accent)] hover:underline">
                  {t('profilePage.editProfileFull', 'Full edit')}
                </Link>
              </div>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h3 className="font-semibold text-[var(--text)] mb-1">{t('profilePage.security')}</h3>
              <Link to="/reset-password" className="text-sm text-[var(--accent)] hover:underline">{t('profilePage.changePassword')}</Link>
            </div>
            <Link to="/coins" className="block rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 hover:bg-amber-500/15 transition-colors">
              <h3 className="font-semibold text-amber-400 mb-1">{t('profilePage.coinWallet')}</h3>
              <p className="text-sm text-[var(--text-muted)]">{t('profilePage.coinWalletDesc')}</p>
            </Link>
            <Link to="/settings/privacy" className="block rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 hover:bg-[var(--bg-elevated)] transition-colors">
              <h3 className="font-semibold text-[var(--text)] mb-1">{t('profilePage.privacyData', 'Privacy & Data')}</h3>
              <p className="text-sm text-[var(--text-muted)]">{t('profilePage.privacyDataDesc', 'Export or delete your data')}</p>
            </Link>
            <Link to="/blocked" className="block rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 hover:bg-[var(--bg-elevated)] transition-colors">
              <h3 className="font-semibold text-[var(--text)] mb-1">{t('profilePage.blockedUsers', 'Blocked Users')}</h3>
              <p className="text-sm text-[var(--text-muted)]">{t('profilePage.blockedUsersDesc', 'Manage blocked accounts')}</p>
            </Link>
            <Link to="/tv-pairing" className="block rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-5 hover:bg-indigo-500/15 transition-colors">
              <h3 className="font-semibold text-indigo-400 mb-1">{t('profilePage.connectTv', 'Connect TV')}</h3>
              <p className="text-sm text-[var(--text-muted)]">{t('profilePage.connectTvDesc', 'Pair Apple TV or Android TV')}</p>
            </Link>
          </div>
        )}

        <div className="mt-8">
          <Link to={'/creator/' + handle + '/shop'} className="btn-primary inline-flex items-center gap-2">{t('profilePage.viewShop')}</Link>
        </div>
      </div>
    </>
  );
}
