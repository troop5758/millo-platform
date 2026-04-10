/**
 * AuctionDetailPage — implicit route `/auction/:id`
 * Displays a single auction and allows live bidding.
 *
 * Backend:
 *  - GET  /shop/auctions/:id
 *  - POST /shop/auctions/:auctionId/bid
 *
 * Real-time (WS):
 *  - ws: /ws/auction/:auctionId?token=...
 *
 * https://milloapp.com
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../../components/SEO';
import { fetchAuction, placeBid } from '../../sdk/contentApi';
import { getUser } from '../../sdk/authApi';
import { getApiBase } from '../../config/api.js';

function fmtCents(c) {
  if (c == null && c !== 0) return '$0.00';
  return '$' + (c / 100).toFixed(2);
}

function msToHuman(ms, t) {
  if (!ms || ms <= 0) return t('auctions.ended', 'Ended');
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function AuctionDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams(); // implicit route param

  const me = getUser();

  const [auction, setAuction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [bidAmt, setBidAmt] = useState('');
  const [bidBusy, setBidBusy] = useState(false);
  const [bidError, setBidError] = useState(null);
  const [bidMsg, setBidMsg] = useState(null);

  const [wsStatus, setWsStatus] = useState('connecting'); // connecting | live | error
  const [wsPolling, setWsPolling] = useState(false);
  const wsRef = useRef(null);

  const applyAuctionUpdate = useCallback((updated) => {
    setAuction(updated);
    // Suggest next bid amount based on updated minimum.
    const minBidCents = (updated.currentBidCents ?? updated.startBidCents - 1) + 1;
    if (!Number.isFinite(minBidCents)) return;
    setBidAmt((prev) => {
      const prevCents = Math.round(parseFloat(prev || '0') * 100);
      return prevCents <= (updated.currentBidCents ?? 0) ? (minBidCents + 0) / 100 : prev;
    });
  }, []);

  const load = useCallback(async () => {
    setLoadError(false);
    setLoading(true);
    try {
      const a = await fetchAuction(id);
      applyAuctionUpdate(a);
    } catch (e) {
      setLoadError(true);
      setAuction(null);
    } finally {
      setLoading(false);
    }
  }, [id, applyAuctionUpdate]);

  useEffect(() => {
    if (!id) return;
    load();
  }, [id, load]);

  // WebSocket for real-time bid updates (best effort).
  useEffect(() => {
    if (!id) return;
    const token = localStorage.getItem('millo_token') || '';
    const wsBase = (import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || getApiBase()).replace(/^http/, 'ws');
    const wsUrl = `${wsBase}/ws/auction/${encodeURIComponent(id)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;

    let ws;
    let reconnectTimer;
    let attempts = 0;

    const connect = () => {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus('live');
        setWsPolling(false);
        attempts = 0;
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'bid' && msg.auction) applyAuctionUpdate(msg.auction);
          if (msg.type === 'auction_ended' && msg.auction) applyAuctionUpdate(msg.auction);
        } catch {
          // ignore malformed payloads
        }
      };

      ws.onclose = () => {
        setWsStatus('error');
        attempts += 1;
        if (auction?.status === 'ended') return;
        reconnectTimer = setTimeout(connect, Math.min(2000 * 2 ** attempts, 30000));
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [id, applyAuctionUpdate, auction?.status]);

  // Poll if WS is down.
  useEffect(() => {
    if (wsStatus !== 'error') return;
    setWsPolling(true);
    const interval = setInterval(() => load(), 10000);
    return () => {
      clearInterval(interval);
      setWsPolling(false);
    };
  }, [wsStatus, load]);

  const handleBack = () => navigate(-1);

  const ended = auction?.status === 'ended';
  const minBid = auction ? (auction.currentBidCents ?? auction.startBidCents - 1) + 1 : null;

  const handleBid = async (e) => {
    e?.preventDefault?.();
    if (!auction || !minBid) return;

    const cents = Math.round(parseFloat(bidAmt || '0') * 100);
    if (!cents || cents < minBid) {
      setBidError(t('auctions.bidTooLow', { amount: fmtCents(minBid) }));
      return;
    }
    if (!me) {
      setBidError(t('auctions.loginRequired', 'Please log in to bid'));
      return;
    }

    setBidBusy(true);
    setBidError(null);
    setBidMsg(null);
    try {
      const res = await placeBid(id, cents);
      applyAuctionUpdate(res.auction || res?.auction || res);
      setBidMsg(t('auctions.bidPlaced', { amount: fmtCents(cents) }));
    } catch (err) {
      setBidError(err.message || 'Bid failed');
    } finally {
      setBidBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError || !auction) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-[var(--bg)] px-4">
        <div className="text-5xl">🔨</div>
        <h1 className="text-xl font-semibold text-[var(--text)]">{t('auctions.errorLoad', 'Auction unavailable')}</h1>
        <p className="text-sm text-[var(--text-muted)]">{t('auctions.errorLoadDesc', 'Could not load auction details.')}</p>
        <button
          type="button"
          onClick={load}
          className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors"
        >
          {t('common.retry', 'Retry')}
        </button>
      </div>
    );
  }

  return (
    <>
      <SEO title={`${auction.title || 'Auction'} — Millo`} description={auction.description || ''} path={`/auction/${id}`} image={auction.imageUrl || undefined} />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-2 text-sm text-[var(--accent)] hover:underline mb-6"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('auctions.backToShop', 'Back')}
        </button>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--bg-card)]">
            <div className="aspect-square bg-[var(--bg-elevated)] flex items-center justify-center relative">
              {auction.imageUrl ? <img src={auction.imageUrl} alt={auction.title} className="w-full h-full object-cover" /> : <span className="text-7xl">🛍</span>}
              {auction.status === 'live' && (
                <div className="absolute top-3 left-3 px-2 py-1 rounded-lg bg-red-500 text-white text-xs font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  LIVE
                </div>
              )}
              {auction.endsAt && auction.status !== 'ended' && (
                <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs font-mono px-2 py-0.5 rounded">
                  {msToHuman(new Date(auction.endsAt).getTime() - Date.now(), t)}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text)]">{auction.title}</h1>
              {auction.description ? <p className="text-sm text-[var(--text-muted)] mt-2">{auction.description}</p> : null}
              <div className="text-xs text-[var(--text-muted)] mt-3">
                Status: {auction.status}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <p className="text-xs text-[var(--text-muted)]">{t('auctions.currentBid', 'Current bid')}</p>
                <p className="text-2xl font-extrabold text-[var(--accent)] mt-1">{fmtCents(auction.currentBidCents ?? auction.startBidCents)}</p>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <p className="text-xs text-[var(--text-muted)]">{t('auctions.bids', 'Bids')}</p>
                <p className="text-2xl font-extrabold text-[var(--text)] mt-1">{auction.bids?.length ?? 0}</p>
              </div>
            </div>

            {bidError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-[var(--error)]">
                {bidError}
              </div>
            )}
            {bidMsg && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">
                {bidMsg}
              </div>
            )}

            {/* Bid composer */}
            <form onSubmit={handleBid} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{t('auctions.bidLabel', 'Your bid')}</label>
                <input
                  value={bidAmt}
                  onChange={(e) => setBidAmt(e.target.value)}
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  disabled={bidBusy || auction.status !== 'live'}
                  placeholder={t('auctions.bidPlaceholder', 'e.g. 10.00')}
                />
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Min bid: {minBid ? fmtCents(minBid) : '—'}
                </p>
              </div>

              <button
                type="submit"
                disabled={bidBusy || auction.status !== 'live'}
                className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-60"
              >
                {bidBusy ? t('common.loading', 'Sending…') : t('auctions.placeBid', 'Place bid')}
              </button>

              {wsPolling && (
                <div className="text-xs text-[var(--text-muted)] text-center">
                  {t('auctions.wsDown', 'Updating via polling…')}
                </div>
              )}
            </form>

            {ended && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                <div className="text-sm font-semibold text-[var(--text)]">{t('auctions.ended', 'Auction ended')}</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  {auction.winnerId ? `Winner: ${String(auction.winnerId).slice(-8)}` : 'No winner'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

