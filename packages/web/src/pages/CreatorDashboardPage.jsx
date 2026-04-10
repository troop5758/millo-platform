/**
 * CreatorDashboardPage — dedicated creator control room.
 * Revenue, subscribers, top streams, top gifts, quick actions, ads.
 * GET /content/analytics/me  ·  GET /ads/campaigns
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { MilloCoin } from '../components/MilloCoin';
import { getUser } from '../sdk/authApi';
import {
  fetchAnalyticsRaw, fetchAdsCampaigns, createAdCampaign,
  fetchPayoutHistory, requestPayout,
  createPpvContent, listPpvContent, updatePpvContentPrice,
  createPpvBundle, listPpvBundles,
  createPpvMassMessage, listPpvMassMessages, sendPpvMassMessage,
  schedulePpvStream, updatePpvStreamPrice, listScheduledPpvStreams,
  fetchPpvAnalytics,
  listUpsellFunnels, createUpsellFunnel, updateUpsellFunnel, deleteUpsellFunnel,
  fetchFanAnalytics, fetchLiveTickets, fetchCreatorRevenue,
} from '../sdk/contentApi';

function fmtCents(c) { return c == null ? '—' : `$${(c / 100).toFixed(2)}`; }
function fmtNum(n)   { if (!n && n !== 0) return '—'; if (n >= 1e6) return (n/1e6).toFixed(1)+'M'; if (n >= 1e3) return (n/1e3).toFixed(1).replace('.0','')+'K'; return String(n); }
function pct(a, b)   { if (!b) return null; const v = Math.round(((a - b) / b) * 100); return v > 0 ? `+${v}%` : `${v}%`; }

/* ── Mini inline bar chart ── */
function BarChart({ values = [], label = '', color = '#7c3aed' }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-12">
      {values.map((v, i) => (
        <div key={i} style={{ height: `${Math.round((v / max) * 100)}%`, backgroundColor: color, opacity: i === values.length - 1 ? 1 : 0.45 }}
          className="flex-1 rounded-sm min-h-[2px]" title={`${label}: ${v}`} />
      ))}
    </div>
  );
}

/* ── KPI card ── */
function KPICard({ label, value, change, sub, icon, color = 'bg-[var(--accent)]/10 text-[var(--accent)]' }) {
  const up = change && change.startsWith('+');
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          {icon}
        </div>
        {change && (
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${up ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
            {change}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-[var(--text)]">{value}</p>
      <p className="text-sm text-[var(--text-muted)] mt-0.5">{label}</p>
      {sub && <p className="text-xs text-[var(--text-muted)] mt-1 opacity-70">{sub}</p>}
    </div>
  );
}

/* ── Revenue chart (weekly) ── */
function RevenueChart({ data = [] }) {
  const { t } = useTranslation();
  if (!data.length) return null;
  const values = data.map((d) => d.totalCents || 0);
  const labels = data.map((d) => d.date || '');
  const max    = Math.max(...values, 1);
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">{t('dashboard.revenueChart')}</h3>
      <div className="flex items-end gap-1 h-24 mb-2">
        {values.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${labels[i]}: ${fmtCents(v)}`}>
            <div className="w-full rounded-sm min-h-[2px]"
              style={{ height: `${Math.max(Math.round((v / max) * 100), 2)}%`, backgroundColor: 'var(--accent)', opacity: 0.7 + (i === values.length - 1 ? 0.3 : 0) }}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span>{labels[0]}</span>
        <span className="font-semibold text-[var(--accent)]">{fmtCents(values.reduce((a, b) => a + b, 0))} {t('dashboard.revenueTotal')}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}

/* ── Payout Request Modal ── */
function PayoutModal({ walletBalance, onClose, onSuccess }) {
  const { t } = useTranslation();
  const [amount,    setAmount]    = useState('');
  const [provider,  setProvider]  = useState('paypal');
  const [dest,      setDest]      = useState('');
  const [busy,      setBusy]      = useState(false);
  const [err,       setErr]       = useState(null);
  const [history,    setHistory]    = useState([]);
  const [histTab,    setHistTab]    = useState('request'); // request | history
  const [histErr,    setHistErr]    = useState(false);
  const [histLoading,setHistLoading]= useState(false);

  const loadHistory = useCallback(() => {
    setHistLoading(true);
    setHistErr(false);
    fetchPayoutHistory()
      .then((payouts) => setHistory(payouts))
      .catch(() => setHistErr(true))
      .finally(() => setHistLoading(false));
  }, []);

  // Load payout history
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const maxCents  = walletBalance ?? 0;
  const amtCents  = Math.round(parseFloat(amount || '0') * 100);
  const canSubmit = amtCents >= 500 && amtCents <= maxCents && dest.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true); setErr(null);
    try {
      await requestPayout(amtCents, provider, dest.trim());
      onSuccess();
      onClose();
    } catch (ex) {
      setErr(ex.message);
    }
    setBusy(false);
  };

  const statusColor = { pending: 'text-amber-500', approved: 'text-emerald-500', rejected: 'text-red-500', processing: 'text-blue-500' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-bold text-[var(--text)]">{t('dashboard.payout')}</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[var(--bg-elevated)] flex items-center justify-center">
            <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)]">
          {[['request', t('dashboard.requestPayout')], ['history', t('dashboard.payoutHistory')]].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setHistTab(id)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${histTab === id ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
              {label}
            </button>
          ))}
        </div>

        {histTab === 'request' ? (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Balance */}
            <div className="rounded-xl bg-[var(--bg-elevated)] px-4 py-3 flex justify-between items-center">
              <span className="text-sm text-[var(--text-muted)]">{t('dashboard.availableBalance')}</span>
              <span className="text-sm font-bold text-emerald-500">${((maxCents) / 100).toFixed(2)}</span>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">{t('dashboard.amountLabel')}</label>
              <input type="number" min="5.00" step="0.01" max={(maxCents / 100).toFixed(2)} value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
              <p className="text-xs text-[var(--text-muted)] mt-1">{t('dashboard.payoutMin', { min: '5.00', max: (maxCents / 100).toFixed(2) })}</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">{t('dashboard.payoutMethod')}</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
                <option value="paypal">PayPal</option>
                <option value="bank">Bank transfer</option>
                <option value="stripe">Stripe</option>
                <option value="crypto">Crypto</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
                {provider === 'paypal' ? 'PayPal email' : provider === 'bank' ? 'Account / routing details' : provider === 'crypto' ? 'Wallet address' : 'Stripe account ID'}
              </label>
              <input type="text" value={dest} onChange={(e) => setDest(e.target.value)}
                placeholder={provider === 'paypal' ? 'you@paypal.com' : provider === 'crypto' ? '0x...' : 'Enter details'}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
            </div>

            {err && <p className="text-sm text-red-500">{err}</p>}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors">
                {t('dashboard.cancelPayout')}
              </button>
              <button type="submit" disabled={busy || !canSubmit}
                className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
                {busy && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {t('dashboard.requestPayout')}
              </button>
            </div>
            <p className="text-xs text-center text-[var(--text-muted)]">{t('dashboard.payoutTimeline')}</p>
          </form>
        ) : (
          <div className="divide-y divide-[var(--border)] max-h-80 overflow-y-auto">
            {histLoading ? (
              <div className="py-10 flex justify-center">
                <div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : histErr ? (
              <div className="py-10 flex flex-col items-center gap-3">
                <p className="text-sm text-[var(--text-muted)]">{t('dashboard.failedPayoutHistory')}</p>
                <button type="button" onClick={loadHistory}
                  className="text-xs text-[var(--accent)] hover:underline font-medium">
                  {t('dashboard.retry')}
                </button>
              </div>
            ) : history.length === 0 ? (
              <p className="text-center py-10 text-sm text-[var(--text-muted)]">{t('dashboard.noPayoutHistory')}</p>
            ) : history.map((p) => (
              <div key={String(p._id)} className="flex items-center gap-3 px-6 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--text)]">${(p.amountCents / 100).toFixed(2)} via {p.provider}</p>
                  <p className="text-xs text-[var(--text-muted)]">{new Date(p.createdAt).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs font-semibold capitalize ${statusColor[p.status] || 'text-[var(--text-muted)]'}`}>{p.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Create PPV Content Modal ── */
function CreatePpvContentModal({ onClose, onCreated }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contentType, setContentType] = useState('video');
  const [mediaUrl, setMediaUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [basePriceCents, setBasePriceCents] = useState('');
  const [scheduledRelease, setScheduledRelease] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { setErr(t('dashboard.ppv.titleRequired', { defaultValue: 'Title is required' })); return; }
    const price = basePriceCents ? Math.round(parseFloat(basePriceCents) * 100) : 0;
    if (price > 0 && (price < 99 || price > 99999)) { setErr(t('dashboard.ppv.invalidPrice', { defaultValue: 'Price must be $0.99–$999.99' })); return; }
    setBusy(true); setErr(null);
    try {
      const content = await createPpvContent({
        title: title.trim(),
        description: description.trim(),
        contentType,
        mediaUrl: mediaUrl.trim() || undefined,
        thumbnailUrl: thumbnailUrl.trim() || undefined,
        basePriceCents: price,
        scheduledRelease: scheduledRelease || undefined,
      });
      onCreated(content);
      onClose();
    } catch (e) {
      setErr(e.message || t('dashboard.ppv.createFailed', { defaultValue: 'Failed to create' }));
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">{t('dashboard.ppv.createContent', { defaultValue: 'Create PPV content' })}</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[var(--bg-elevated)] flex items-center justify-center">
            <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Title *</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Premium video"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Description</label>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Type</label>
          <select value={contentType} onChange={(e) => setContentType(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
            <option value="video">Video</option>
            <option value="image">Image</option>
            <option value="post">Post</option>
            <option value="download">Download</option>
            <option value="livestream_replay">Livestream replay</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Media URL</label>
          <input type="url" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://…"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Price (USD)</label>
          <input type="number" min="0" step="0.01" value={basePriceCents} onChange={(e) => setBasePriceCents(e.target.value)} placeholder="4.99"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Scheduled release (optional)</label>
          <input type="datetime-local" value={scheduledRelease} onChange={(e) => setScheduledRelease(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)]">{t('common.cancel')}</button>
          <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {busy && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {t('dashboard.createCampaign', { defaultValue: 'Create' })}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Create PPV Bundle Modal ── */
function CreatePpvBundleModal({ onClose, onCreated }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contentIds, setContentIds] = useState('');
  const [streamIds, setStreamIds] = useState('');
  const [priceCents, setPriceCents] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) { setErr(t('dashboard.ppv.titleRequired', { defaultValue: 'Title is required' })); return; }
    const cIds = contentIds.trim() ? contentIds.trim().split(/[\s,]+/).filter(Boolean) : [];
    const sIds = streamIds.trim() ? streamIds.trim().split(/[\s,]+/).filter(Boolean) : [];
    if (cIds.length === 0 && sIds.length === 0) { setErr(t('dashboard.ppv.contentRequired', { defaultValue: 'Add at least one content or stream ID' })); return; }
    const price = priceCents ? Math.round(parseFloat(priceCents) * 100) : 0;
    if (price < 99) { setErr(t('dashboard.ppv.invalidPrice', { defaultValue: 'Price must be at least $0.99' })); return; }
    setBusy(true); setErr(null);
    try {
      const bundle = await createPpvBundle({
        title: title.trim(),
        name: title.trim(),
        description: description.trim(),
        contentIds: cIds,
        streamIds: sIds,
        priceCents: price,
        bundlePriceCents: price,
      });
      onCreated(bundle);
      onClose();
    } catch (e) {
      setErr(e.message || t('dashboard.ppv.createFailed', { defaultValue: 'Failed to create' }));
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">{t('dashboard.ppv.createBundle', { defaultValue: 'Create bundle' })}</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[var(--bg-elevated)] flex items-center justify-center">
            <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Title *</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Premium bundle"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Content IDs (comma-separated)</label>
          <input type="text" value={contentIds} onChange={(e) => setContentIds(e.target.value)} placeholder="id1, id2, id3"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Stream IDs (comma-separated, optional)</label>
          <input type="text" value={streamIds} onChange={(e) => setStreamIds(e.target.value)} placeholder="streamId1, streamId2"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Bundle price (USD) *</label>
          <input type="number" min="0.99" step="0.01" value={priceCents} onChange={(e) => setPriceCents(e.target.value)} placeholder="9.99"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)]">{t('common.cancel')}</button>
          <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {busy && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {t('dashboard.createCampaign', { defaultValue: 'Create' })}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Mass PPV Message Modal ── */
function MassPpvMessageModal({ onClose, onCreated, contentList = [] }) {
  const { t } = useTranslation();
  const [messageText, setMessageText] = useState('');
  const [contentId, setContentId] = useState('');
  const [priceCents, setPriceCents] = useState('');
  const [recipientIds, setRecipientIds] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!contentId) { setErr(t('dashboard.ppv.contentRequired', { defaultValue: 'Select content' })); return; }
    const price = priceCents ? Math.round(parseFloat(priceCents) * 100) : 0;
    if (price < 99) { setErr(t('dashboard.ppv.invalidPrice', { defaultValue: 'Price must be at least $0.99' })); return; }
    const rIds = recipientIds.trim() ? recipientIds.trim().split(/[\s,]+/).filter(Boolean) : [];
    setBusy(true); setErr(null);
    try {
      const msg = await createPpvMassMessage({
        messageText: messageText.trim(),
        contentId,
        priceCents: price,
        recipientIds: rIds.length > 0 ? rIds : undefined,
      });
      onCreated(msg);
      onClose();
    } catch (e) {
      setErr(e.message || t('dashboard.ppv.createFailed', { defaultValue: 'Failed to create' }));
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">{t('dashboard.ppv.massMessage', { defaultValue: 'Send mass PPV message' })}</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[var(--bg-elevated)] flex items-center justify-center">
            <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Message text</label>
          <textarea rows={2} value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Check out this exclusive content!"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Content ID *</label>
          <input type="text" value={contentId} onChange={(e) => setContentId(e.target.value)} placeholder="Content ID"
            list="ppv-content-list"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
          {contentList.length > 0 && (
            <datalist id="ppv-content-list">
              {contentList.map((c) => <option key={c._id} value={c._id}>{c.title}</option>)}
            </datalist>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Price (USD) *</label>
          <input type="number" min="0.99" step="0.01" value={priceCents} onChange={(e) => setPriceCents(e.target.value)} placeholder="4.99"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Recipient IDs (optional, comma-separated; leave empty for all subscribers)</label>
          <input type="text" value={recipientIds} onChange={(e) => setRecipientIds(e.target.value)} placeholder="userId1, userId2"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)]">{t('common.cancel')}</button>
          <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {busy && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {t('dashboard.createCampaign', { defaultValue: 'Create' })}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Adjust PPV Price Modal ── */
function AdjustPpvPriceModal({ contentId, currentPrice, onClose, onSaved }) {
  const { t } = useTranslation();
  const [price, setPrice] = useState(String(currentPrice || '0'));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cents = Math.round(parseFloat(price || '0') * 100);
    if (cents < 99 && cents > 0) { setErr(t('dashboard.ppv.invalidPrice', { defaultValue: 'Min $0.99' })); return; }
    setBusy(true); setErr(null);
    try {
      await updatePpvContentPrice(contentId, cents);
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-[var(--text)]">{t('dashboard.ppv.adjustPrice', { defaultValue: 'Adjust price' })}</h2>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Price (USD)</label>
          <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)]">{t('common.cancel')}</button>
          <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold disabled:opacity-50">{t('common.save')}</button>
        </div>
      </form>
    </div>
  );
}

/* ── Create Upsell Funnel Modal ── */
const TRIGGER_EVENTS = ['subscription', 'ppv_purchase', 'gift', 'shop_purchase', 'live_ticket'];
const UPSELL_TYPES = ['ppv', 'subscription_upgrade', 'coin_pack', 'shop_product'];

function CreateFunnelModal({ onClose, onCreated }) {
  const { t } = useTranslation();
  const [triggerEvent, setTriggerEvent] = useState('ppv_purchase');
  const [upsellType, setUpsellType] = useState('ppv');
  const [targetContentId, setTargetContentId] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const funnel = await createUpsellFunnel({
        triggerEvent,
        upsellType,
        targetContentId: targetContentId.trim() || undefined,
        price: price ? Math.round(parseFloat(price) * 100) : 0,
      });
      onCreated(funnel);
      onClose();
    } catch (e) {
      setErr(e.message || t('dashboard.funnels.createFailed', { defaultValue: 'Failed to create' }));
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">{t('dashboard.funnels.create', { defaultValue: 'Create funnel' })}</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[var(--bg-elevated)] flex items-center justify-center">
            <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">When (trigger event)</label>
          <select value={triggerEvent} onChange={(e) => setTriggerEvent(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
            {TRIGGER_EVENTS.map((ev) => <option key={ev} value={ev}>{ev.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Suggest (upsell type)</label>
          <select value={upsellType} onChange={(e) => setUpsellType(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
            {UPSELL_TYPES.map((ty) => <option key={ty} value={ty}>{ty.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Target content ID (optional)</label>
          <input type="text" value={targetContentId} onChange={(e) => setTargetContentId(e.target.value)} placeholder="PpvContent ID"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Price (USD, optional)</label>
          <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="4.99"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>
        {err && <p className="text-sm text-red-500">{err}</p>}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)]">{t('common.cancel')}</button>
          <button type="submit" disabled={busy} className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
            {busy && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {t('dashboard.createCampaign', { defaultValue: 'Create' })}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── New Campaign Modal ── */
function NewCampaignModal({ onClose, onCreated }) {
  const { t } = useTranslation();
  const [name,       setName]       = useState('');
  const [objective,  setObjective]  = useState('awareness');
  const [budget,     setBudget]     = useState('');
  const [startDate,  setStartDate]  = useState('');
  const [endDate,    setEndDate]    = useState('');
  const [busy,       setBusy]       = useState(false);
  const [err,        setErr]        = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setErr(t('dashboard.campaignRequired')); return; }
    setBusy(true); setErr(null);
    try {
      const data = await createAdCampaign({
        name: name.trim(),
        objective,
        budgetCents: Math.round(parseFloat(budget || 0) * 100),
        startDate: startDate || undefined,
        endDate:   endDate   || undefined,
      });
      onCreated(data.campaign);
      onClose();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--text)]">{t('dashboard.newCampaign')}</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-[var(--bg-elevated)] flex items-center justify-center transition-colors">
            <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">{t('dashboard.campaignName')} *</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Summer Promo 2026"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">{t('dashboard.campaignObjective')}</label>
          <select value={objective} onChange={(e) => setObjective(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
            <option value="awareness">Brand Awareness</option>
            <option value="traffic">Drive Traffic</option>
            <option value="conversions">Conversions</option>
            <option value="followers">Grow Followers</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">{t('dashboard.campaignBudget')}</label>
          <input type="number" min="0" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="10.00"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">{t('dashboard.campaignStart')}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">{t('dashboard.campaignEnd')}</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
          </div>
        </div>

        {err && <p className="text-sm text-red-500">{err}</p>}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={busy}
            className="flex-1 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {busy && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {busy ? t('dashboard.creating') : t('dashboard.createCampaign')}
          </button>
        </div>
      </form>
    </div>
  );
}

export function CreatorDashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getUser();
  const [analytics,       setAnalytics]       = useState(null);
  const [campaigns,       setCampaigns]       = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [tab,             setTab]             = useState('overview');
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [showPayout,      setShowPayout]      = useState(false);
  const [ppvContent,      setPpvContent]      = useState([]);
  const [ppvBundles,      setPpvBundles]     = useState([]);
  const [ppvMassMsgs,     setPpvMassMsgs]    = useState([]);
  const [ppvScheduled,    setPpvScheduled]   = useState([]);
  const [ppvAnalytics,    setPpvAnalytics]  = useState(null);
  const [showCreateContent, setShowCreateContent] = useState(false);
  const [showCreateBundle,   setShowCreateBundle]   = useState(false);
  const [showMassMessage,    setShowMassMessage]    = useState(false);
  const [editingPriceFor,   setEditingPriceFor]   = useState(null);
  const [funnels,           setFunnels]           = useState([]);
  const [fanAnalytics,      setFanAnalytics]      = useState(null);
  const [liveTickets,       setLiveTickets]       = useState([]);
  const [showCreateFunnel,  setShowCreateFunnel]   = useState(false);

  const loadPpv = useCallback(async () => {
    const [content, bundles, massMsgs, scheduled, analytics] = await Promise.allSettled([
      listPpvContent({ status: 'all', limit: 30 }),
      listPpvBundles('active'),
      listPpvMassMessages(20),
      listScheduledPpvStreams(),
      fetchPpvAnalytics(),
    ]);
    if (content.status === 'fulfilled') setPpvContent(content.value.items || []);
    if (bundles.status === 'fulfilled') setPpvBundles(bundles.value || []);
    if (massMsgs.status === 'fulfilled') setPpvMassMsgs(massMsgs.value || []);
    if (scheduled.status === 'fulfilled') setPpvScheduled(scheduled.value || []);
    if (analytics.status === 'fulfilled') setPpvAnalytics(analytics.value);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, c, ppvA] = await Promise.allSettled([
      fetchAnalyticsRaw(),
      fetchAdsCampaigns(5),
      fetchPpvAnalytics(),
    ]);
    if (a.status === 'fulfilled') setAnalytics(a.value);
    if (c.status === 'fulfilled') setCampaigns(c.value.campaigns || []);
    if (ppvA.status === 'fulfilled') setPpvAnalytics(ppvA.value);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) { navigate('/login', { replace: true }); return; }
    load();
  }, [load, user, navigate]);

  const loadFunnels = useCallback(async () => {
    const list = await listUpsellFunnels('all').catch(() => []);
    setFunnels(list);
  }, []);
  const loadFanAnalytics = useCallback(async () => {
    const data = await fetchFanAnalytics(20).catch(() => ({ topFans: [], eventBreakdown: {} }));
    setFanAnalytics(data);
  }, []);
  const loadLiveTickets = useCallback(async () => {
    const list = await fetchLiveTickets('all').catch(() => []);
    setLiveTickets(list);
  }, []);

  useEffect(() => {
    if (tab === 'ppv' && user) loadPpv();
  }, [tab, user, loadPpv]);
  useEffect(() => {
    if (tab === 'funnels' && user) loadFunnels();
  }, [tab, user, loadFunnels]);
  useEffect(() => {
    if (tab === 'fans' && user) loadFanAnalytics();
  }, [tab, user, loadFanAnalytics]);
  useEffect(() => {
    if ((tab === 'ppv' || tab === 'funnels') && user) loadLiveTickets();
  }, [tab, user, loadLiveTickets]);

  const a = analytics || {};
  const topGifts       = a.topGifts        || [];
  const topStreams      = a.topStreams       || [];
  const revenueData    = a.revenueData      || [];
  const subGrowthData  = a.subscriberGrowth || [];

  const TABS = [
    { id: 'overview',      label: t('dashboard.tabs.overview') },
    { id: 'ppv',           label: t('dashboard.tabs.ppv', { defaultValue: 'PPV' }) },
    { id: 'subscriptions', label: t('dashboard.tabs.subscriptions') },
    { id: 'funnels',       label: t('dashboard.tabs.funnels', { defaultValue: 'Upsell funnels' }) },
    { id: 'fans',          label: t('dashboard.tabs.fans', { defaultValue: 'Fan analytics' }) },
    { id: 'streams',       label: t('dashboard.tabs.streams') },
    { id: 'earnings',      label: t('dashboard.tabs.earnings') },
    { id: 'ads',           label: t('dashboard.tabs.ads') },
  ];

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 flex justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      <SEO title={t('dashboard.seoTitle')} description={t('dashboard.seoDesc')} path="/dashboard" />
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">{t('dashboard.title')}</h1>
            <p className="text-sm text-[var(--text-muted)] mt-0.5">
              {t('dashboard.welcome', { name: user?.displayName || user?.email })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/go-live"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors shadow">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>
              {t('dashboard.goLive')}
            </Link>
            <Link to="/creator-apply"
              className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors">
              {t('dashboard.creatorStatus')}
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[var(--border)] mb-6">
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.id
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview Tab ── */}
        {tab === 'overview' && (
          <>
            {/* KPI grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <KPICard
                label={t('dashboard.kpi.followers')}
                value={fmtNum(a.followers)}
                sub={a.newFollowersThisWeek != null ? t('dashboard.kpi.thisWeek', { count: a.newFollowersThisWeek }) : null}
                color="bg-blue-500/10 text-blue-500"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
              />
              <KPICard
                label={t('dashboard.kpi.subscribers')}
                value={fmtNum(a.subscribers)}
                color="bg-violet-500/10 text-violet-500"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>}
              />
              <KPICard
                label={t('dashboard.kpi.totalStreams')}
                value={fmtNum(a.totalStreams)}
                sub={a.liveStreams != null ? t('dashboard.kpi.liveNow', { count: a.liveStreams }) : null}
                color="bg-red-500/10 text-red-500"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>}
              />
              <KPICard
                label={t('dashboard.kpi.walletBalance')}
                value={fmtCents(a.walletBalance)}
                color="bg-emerald-500/10 text-emerald-500"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>}
              />
              {ppvAnalytics?.combined?.conversionRate != null && (
                <KPICard
                  label={t('dashboard.kpi.conversionRate', { defaultValue: 'Conversion rate' })}
                  value={`${(ppvAnalytics.combined.conversionRate * 100).toFixed(1)}%`}
                  color="bg-amber-500/10 text-amber-500"
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                />
              )}
            </div>

            {/* Revenue chart */}
            {revenueData.length > 0 && (
              <div className="mb-6">
                <RevenueChart data={revenueData} />
              </div>
            )}

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Top streams */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">{t('dashboard.topStreams')}</h3>
                {topStreams.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)] py-4 text-center">{t('dashboard.noStreams')} <Link to="/go-live" className="text-[var(--accent)]">{t('dashboard.goLiveCta')}</Link></p>
                ) : (
                  <div className="space-y-3">
                    {topStreams.map((s, i) => (
                      <div key={String(s._id || i)} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-[var(--text-muted)] w-4">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text)] truncate">{s.title || t('dashboard.untitledStream')}</p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {s.viewerCount ? `${fmtNum(s.viewerCount)} ${t('dashboard.viewers')}` : ''}{s.totalGiftCoins ? ` · ${fmtNum(s.totalGiftCoins)} ${t('dashboard.coins')}` : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top gifts */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">{t('dashboard.topGifts')}</h3>
                {topGifts.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)] py-4 text-center">{t('dashboard.noGifts')}</p>
                ) : (
                  <div className="space-y-3">
                    {topGifts.map((g, i) => (
                      <div key={String(g._id || i)} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-[var(--text-muted)] w-4">{i + 1}</span>
                        <div className="w-8 h-8 rounded-full bg-[var(--accent)]/15 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-[var(--accent)]">{(g.displayName || 'U')[0].toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text)] truncate">{g.displayName || t('dashboard.userFallback')}</p>
                        </div>
                        <span className="text-sm font-bold text-amber-500 shrink-0">{fmtNum(g.totalCoins)} {t('dashboard.coins')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div className="mt-6 grid sm:grid-cols-3 gap-3">
              {[
                { to: '/go-live',       label: t('dashboard.actions.startStream'),        icon: '📡' },
                { to: '/creator-apply', label: t('dashboard.actions.creatorVerification'), icon: '✓' },
                { to: '/coins',         label: t('dashboard.actions.coinStore'),           icon: null, coinIcon: true },
              ].map((a) => (
                <Link key={a.to} to={a.to}
                  className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] hover:border-[var(--accent)]/30 transition-all group">
                  {a.coinIcon ? <MilloCoin size={24} /> : <span className="text-xl">{a.icon}</span>}
                  <span className="text-sm font-semibold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">{a.label}</span>
                  <svg className="w-4 h-4 text-[var(--text-muted)] ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}
            </div>
          </>
        )}

        {/* ── PPV Tab ── */}
        {tab === 'ppv' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--text)]">{t('dashboard.ppv.title', { defaultValue: 'Pay-Per-View' })}</h2>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowCreateContent(true)}
                  className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-bold hover:bg-[var(--accent-hover)] transition-colors">
                  {t('dashboard.ppv.createContent', { defaultValue: 'Create content' })}
                </button>
                <button type="button" onClick={() => setShowCreateBundle(true)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors">
                  {t('dashboard.ppv.createBundle', { defaultValue: 'Create bundle' })}
                </button>
                <button type="button" onClick={() => setShowMassMessage(true)}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors">
                  {t('dashboard.ppv.massMessage', { defaultValue: 'Mass message' })}
                </button>
              </div>
            </div>

            {/* PPV Analytics */}
            {ppvAnalytics && (
              <div className="grid sm:grid-cols-3 gap-4">
                <KPICard label={t('dashboard.ppv.purchases', { defaultValue: 'Purchases' })} value={fmtNum(ppvAnalytics?.combined?.purchaseCount ?? 0)}
                  color="bg-violet-500/10 text-violet-500"
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>} />
                <KPICard label={t('dashboard.ppv.revenue', { defaultValue: 'PPV Revenue' })} value={fmtCents(ppvAnalytics?.combined?.revenueCents ?? 0)}
                  color="bg-emerald-500/10 text-emerald-500"
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
                <KPICard label={t('dashboard.ppv.conversion', { defaultValue: 'Conversion' })} value={ppvAnalytics?.combined?.conversionRate != null ? `${(ppvAnalytics.combined.conversionRate * 100).toFixed(1)}%` : '—'}
                  color="bg-amber-500/10 text-amber-500"
                  icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>} />
              </div>
            )}

            <div className="grid lg:grid-cols-2 gap-6">
              {/* PPV Content */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">{t('dashboard.ppv.myContent', { defaultValue: 'My PPV content' })}</h3>
                {ppvContent.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)] py-4 text-center">{t('dashboard.ppv.noContent', { defaultValue: 'No PPV content yet. Create your first piece.' })}</p>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {ppvContent.map((c) => (
                      <div key={String(c._id)} className="flex items-center justify-between gap-3 py-2 border-b border-[var(--border)] last:border-0">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[var(--text)] truncate">{c.title || t('dashboard.ppv.untitled', { defaultValue: 'Untitled' })}</p>
                          <p className="text-xs text-[var(--text-muted)]">${((c.basePriceCents || 0) / 100).toFixed(2)} · {c.scheduledRelease ? t('dashboard.ppv.scheduled', { defaultValue: 'Scheduled' }) : (c.isActive ? t('dashboard.ppv.active', { defaultValue: 'Active' }) : t('dashboard.ppv.inactive', { defaultValue: 'Inactive' }))}</p>
                        </div>
                        <button type="button" onClick={() => setEditingPriceFor({ id: c._id, current: (c.basePriceCents || 0) / 100 })}
                          className="text-xs text-[var(--accent)] hover:underline shrink-0">{t('dashboard.ppv.adjustPrice', { defaultValue: 'Adjust' })}</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Scheduled drops & Bundles */}
              <div className="space-y-4">
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                  <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">{t('dashboard.ppv.scheduledDrops', { defaultValue: 'Scheduled PPV drops' })} / {t('dashboard.ppv.liveTickets', { defaultValue: 'Live tickets' })}</h3>
                  {(ppvScheduled.length === 0 && liveTickets.length === 0) ? (
                    <p className="text-sm text-[var(--text-muted)] py-4 text-center">{t('dashboard.ppv.noScheduled', { defaultValue: 'No scheduled PPV streams. Set a price when going live.' })}</p>
                  ) : (
                    <div className="space-y-2">
                      {[...(liveTickets.length > 0 ? liveTickets : ppvScheduled)].slice(0, 5).map((s) => (
                        <div key={String(s._id)} className="flex justify-between text-sm">
                          <span className="text-[var(--text)] truncate">{s.title || t('dashboard.ppv.untitled', { defaultValue: 'Untitled' })}</span>
                          <span className="text-[var(--accent)] shrink-0">${((s.ticketPrice || s.priceCents || 0) / 100).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                  <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">{t('dashboard.ppv.bundles', { defaultValue: 'Bundles' })}</h3>
                  {ppvBundles.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)] py-4 text-center">{t('dashboard.ppv.noBundles', { defaultValue: 'No bundles yet.' })}</p>
                  ) : (
                    <div className="space-y-2">
                      {ppvBundles.slice(0, 5).map((b) => (
                        <div key={String(b._id)} className="flex justify-between text-sm">
                          <span className="text-[var(--text)] truncate">{b.title || b.name || t('dashboard.ppv.untitled', { defaultValue: 'Untitled' })}</span>
                          <span className="text-[var(--accent)] shrink-0">${((b.bundlePriceCents || b.priceCents || 0) / 100).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Mass messages */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">{t('dashboard.ppv.massMessages', { defaultValue: 'Mass PPV messages' })}</h3>
              {ppvMassMsgs.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] py-4 text-center">{t('dashboard.ppv.noMassMessages', { defaultValue: 'No mass messages sent yet. Send locked content to subscribers.' })}</p>
              ) : (
                <div className="space-y-2">
                  {ppvMassMsgs.slice(0, 5).map((m) => (
                    <div key={String(m._id)} className="flex justify-between text-sm py-2 border-b border-[var(--border)] last:border-0">
                      <span className="text-[var(--text)] truncate">{m.messageText?.slice(0, 40) || t('dashboard.ppv.noPreview', { defaultValue: 'No preview' })}…</span>
                      <span className="text-[var(--text-muted)] shrink-0">${((m.priceCents || 0) / 100).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Subscriptions Tab ── */}
        {tab === 'subscriptions' && (
          <div className="space-y-6">
            <div className="grid sm:grid-cols-3 gap-4">
              <KPICard label={t('dashboard.kpi.activeSubscribers')} value={fmtNum(a.subscribers)}
                color="bg-violet-500/10 text-violet-500"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>}
              />
              <KPICard label={t('dashboard.kpi.monthlyRevenue')}
                value={fmtCents((a.subscribers ?? 0) * (a.subPriceCents ?? 500))}
                color="bg-emerald-500/10 text-emerald-500"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
              <KPICard label={t('dashboard.kpi.newThisWeek')} value={`+${fmtNum(a.newFollowersThisWeek ?? 0)}`}
                color="bg-blue-500/10 text-blue-500"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
              />
            </div>

            {/* Subscriber growth chart */}
            {subGrowthData.length > 0 && (() => {
              const vals   = subGrowthData.map((d) => d.count);
              const labels = subGrowthData.map((d) => d.date?.slice(5) || '');
              const max    = Math.max(...vals, 1);
              return (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                  <h3 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">{t('dashboard.subGrowthChart')}</h3>
                  <div className="flex items-end gap-0.5 h-24 mb-2">
                    {vals.map((v, i) => (
                      <div key={i} className="flex-1 rounded-sm min-h-[2px] transition-all"
                        style={{ height: `${Math.max(Math.round((v / max) * 100), v > 0 ? 4 : 2)}%`, backgroundColor: 'var(--accent-premium)', opacity: 0.65 + (i === vals.length - 1 ? 0.35 : 0) }}
                        title={`${labels[i]}: ${t('dashboard.newSubscribers', { count: v })}`} />
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span>{labels[0]}</span>
                    <span className="font-semibold text-[var(--accent-premium)]">
                      {t('dashboard.newSubscribers', { count: vals.reduce((a, b) => a + b, 0) })}
                    </span>
                    <span>{labels[labels.length - 1]}</span>
                  </div>
                </div>
              );
            })()}

            {/* Empty state */}
            {subGrowthData.length === 0 && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-10 text-center text-[var(--text-muted)]">
                <p className="font-medium mb-1">{t('dashboard.noSubData')}</p>
                <p className="text-sm">{t('dashboard.noSubDataDesc')}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Upsell Funnels Tab ── */}
        {tab === 'funnels' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--text)]">{t('dashboard.funnels.title', { defaultValue: 'Upsell funnels' })}</h2>
              <button type="button" onClick={() => setShowCreateFunnel(true)}
                className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-bold hover:bg-[var(--accent-hover)] transition-colors">
                {t('dashboard.funnels.create', { defaultValue: 'Create funnel' })}
              </button>
            </div>
            <p className="text-sm text-[var(--text-muted)]">{t('dashboard.funnels.desc', { defaultValue: 'Automatically recommend PPV, subscriptions, or coin packs when fans perform actions.' })}</p>
            {funnels.length === 0 ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-10 text-center text-[var(--text-muted)]">
                <p className="font-medium mb-1">{t('dashboard.funnels.noFunnels', { defaultValue: 'No upsell funnels yet' })}</p>
                <p className="text-sm mb-4">{t('dashboard.funnels.noFunnelsDesc', { defaultValue: 'Create a funnel to suggest content when fans buy PPV, subscribe, or complete other actions.' })}</p>
                <button type="button" onClick={() => setShowCreateFunnel(true)}
                  className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-hover)] transition-colors">
                  {t('dashboard.funnels.create', { defaultValue: 'Create funnel' })}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {funnels.map((f) => (
                  <div key={String(f._id)} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)] truncate">{f.triggerEvent} → {f.upsellType}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {f.price ? `$${(f.price / 100).toFixed(2)}` : '—'} · {f.isActive ? t('dashboard.funnels.active', { defaultValue: 'Active' }) : t('dashboard.funnels.inactive', { defaultValue: 'Inactive' })}
                      </p>
                    </div>
                    <button type="button" onClick={async () => { if (confirm(t('dashboard.funnels.deleteConfirm', { defaultValue: 'Delete this funnel?' }))) { await deleteUpsellFunnel(f._id); loadFunnels(); } }}
                      className="text-xs text-red-500 hover:underline">{t('common.delete')}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Fan Analytics Tab ── */}
        {tab === 'fans' && (
          <div className="space-y-6">
            <h2 className="text-base font-semibold text-[var(--text)]">{t('dashboard.fans.title', { defaultValue: 'Top fans' })}</h2>
            <p className="text-sm text-[var(--text-muted)]">{t('dashboard.fans.desc', { defaultValue: 'Fans who spent the most on your content (subscriptions, PPV, gifts) in the last 30 days.' })}</p>
            {!fanAnalytics ? (
              <div className="py-10 flex justify-center">
                <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (fanAnalytics.topFans || []).length === 0 ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-10 text-center text-[var(--text-muted)]">
                <p className="font-medium mb-1">{t('dashboard.fans.noFans', { defaultValue: 'No fan data yet' })}</p>
                <p className="text-sm">{t('dashboard.fans.noFansDesc', { defaultValue: 'Top fans will appear here as they subscribe, buy PPV, or send gifts.' })}</p>
              </div>
            ) : (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
                <div className="divide-y divide-[var(--border)]">
                  {(fanAnalytics.topFans || []).map((fan, i) => (
                    <div key={fan.userId || i} className="flex items-center gap-4 px-4 py-3.5">
                      <span className="text-xs font-bold text-[var(--text-muted)] w-6">{i + 1}</span>
                      <div className="w-10 h-10 rounded-full bg-[var(--accent)]/15 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-[var(--accent)]">{(fan.displayName || 'F')[0].toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--text)] truncate">{fan.displayName || t('dashboard.userFallback')}</p>
                      </div>
                      <span className="text-sm font-bold text-emerald-500 shrink-0">{fmtCents(fan.totalSpentCents || 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Streams Tab ── */}
        {tab === 'streams' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold text-[var(--text)]">{t('dashboard.yourStreams')}</h2>
              <Link to="/go-live"
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors">
                {t('dashboard.goLiveShort')}
              </Link>
            </div>
            {(a.recentStreams || []).length === 0 ? (
              <div className="text-center py-16 text-[var(--text-muted)]">
                <p className="mb-2 font-medium">{t('dashboard.noStreams')}</p>
                <Link to="/go-live" className="text-[var(--accent)] text-sm hover:underline">{t('dashboard.goLiveCta')}</Link>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
                {(a.recentStreams || []).map((s) => (
                  <div key={String(s._id)} className="flex items-center gap-4 px-4 py-3.5">
                    <div className="w-16 h-10 rounded-lg bg-[var(--bg-elevated)] overflow-hidden shrink-0">
                      {s.thumbnailUrl
                        ? <img src={s.thumbnailUrl} alt={s.title} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] text-lg">📺</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text)] truncate">{s.title || t('dashboard.untitledStream')}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {s.status === 'live' ? <span className="text-red-500 font-bold">{t('dashboard.liveBadge')}</span> : s.status}
                        {s.viewerCount ? ` · ${fmtNum(s.viewerCount)} ${t('dashboard.viewers')}` : ''}
                      </p>
                    </div>
                    {s.recordingUrl && (
                      <Link to={`/vod?id=${s._id}`}
                        className="shrink-0 text-xs text-[var(--accent)] hover:underline">{t('dashboard.replay')}</Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Earnings Tab ── */}
        {tab === 'earnings' && (
          <div>
            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              <KPICard label={t('dashboard.kpi.totalRevenue')} value={fmtCents(a.totalRevenueCents)} color="bg-emerald-500/10 text-emerald-500"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
              <KPICard label={t('dashboard.kpi.walletBalance')} value={fmtCents(a.walletBalance)} color="bg-blue-500/10 text-blue-500"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>} />
              <KPICard label={t('dashboard.kpi.giftRevenue')} value={fmtNum(a.totalGiftCoins) + ' ' + t('dashboard.coins')} color="bg-amber-500/10 text-amber-500"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>} />
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <RevenueChart data={revenueData} />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={() => setShowPayout(true)}
                className="px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-hover)] transition-colors">
                {t('dashboard.requestPayout')}
              </button>
              <Link to="/pricing"
                className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors">
                {t('dashboard.manageSubscriptions')}
              </Link>
              <Link to="/pricing"
                className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-elevated)] transition-colors">
                {t('dashboard.pricingRules', { defaultValue: 'Pricing rules' })}
              </Link>
            </div>
          </div>
        )}

        {/* ── Ads Tab ── */}
        {tab === 'ads' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[var(--text)]">{t('dashboard.adCampaigns')}</h2>
              <div className="flex items-center gap-2">
                <Link to="/ads" className="text-xs font-medium text-[var(--accent)] hover:underline">
                  {t('ads.manager') || 'Ads Manager →'}
                </Link>
                <button type="button"
                onClick={() => setShowNewCampaign(true)}
                className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-bold hover:bg-[var(--accent-hover)] transition-colors">
                {t('dashboard.newCampaignShort')}
              </button>
            </div>
            </div>
            {campaigns.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-full bg-[var(--bg-elevated)] flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                  </svg>
                </div>
                <p className="text-[var(--text-muted)] font-medium mb-1">{t('dashboard.noCampaigns')}</p>
                <p className="text-sm text-[var(--text-muted)]">{t('dashboard.noCampaignsDesc')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {campaigns.map((c) => {
                  const statusColors = { active: 'text-emerald-600 bg-emerald-50 border-emerald-200', draft: 'text-slate-500 bg-slate-50 border-slate-200', paused: 'text-amber-600 bg-amber-50 border-amber-200', ended: 'text-red-600 bg-red-50 border-red-200' };
                  const sc = statusColors[c.status] || statusColors.draft;
                  const ctr = c.impressions ? Math.round((c.clicks / c.impressions) * 100) : 0;
                  return (
                    <div key={String(c._id)} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-[var(--text)] text-sm">{c.name}</p>
                            <span className={`px-2 py-0.5 rounded border text-xs font-medium ${sc}`}>{c.status}</span>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
                            <span>{fmtNum(c.impressions)} {t('dashboard.impressions')}</span>
                            <span>{fmtNum(c.clicks)} {t('dashboard.clicks')}</span>
                            <span>{ctr}% {t('dashboard.ctr')}</span>
                            <span>{fmtCents(c.spentCents)} / {fmtCents(c.budgetCents)}</span>
                          </div>
                          {c.budgetCents > 0 && (
                            <div className="mt-2 h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                              <div className="h-full rounded-full bg-[var(--accent)]"
                                style={{ width: `${Math.min(Math.round((c.spentCents / c.budgetCents) * 100), 100)}%` }} />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {showNewCampaign && (
        <NewCampaignModal
          onClose={() => setShowNewCampaign(false)}
          onCreated={(camp) => { setCampaigns((prev) => [camp, ...prev]); }}
        />
      )}

      {showPayout && (
        <PayoutModal
          walletBalance={a.walletBalance ?? 0}
          onClose={() => setShowPayout(false)}
          onSuccess={() => { load(); }}
        />
      )}

      {showCreateContent && (
        <CreatePpvContentModal
          onClose={() => setShowCreateContent(false)}
          onCreated={() => { setShowCreateContent(false); loadPpv(); }}
        />
      )}
      {showCreateBundle && (
        <CreatePpvBundleModal
          onClose={() => setShowCreateBundle(false)}
          onCreated={() => { setShowCreateBundle(false); loadPpv(); }}
        />
      )}
      {showMassMessage && (
        <MassPpvMessageModal
          contentList={ppvContent}
          onClose={() => setShowMassMessage(false)}
          onCreated={() => { setShowMassMessage(false); loadPpv(); }}
        />
      )}
      {editingPriceFor && (
        <AdjustPpvPriceModal
          contentId={editingPriceFor.id}
          currentPrice={editingPriceFor.current}
          onClose={() => setEditingPriceFor(null)}
          onSaved={() => { setEditingPriceFor(null); loadPpv(); }}
        />
      )}
      {showCreateFunnel && (
        <CreateFunnelModal
          onClose={() => setShowCreateFunnel(false)}
          onCreated={() => { setShowCreateFunnel(false); loadFunnels(); }}
        />
      )}
    </>
  );
}
