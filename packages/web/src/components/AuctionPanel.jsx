/**
 * AuctionPanel — live auction overlay on stream player.
 * Real-time bidding via WebSocket + HTTP placeBid API.
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchStreamLiveAuction, placeBid } from '../sdk/contentApi';
import { getUser, getToken } from '../sdk/authApi';
import { getApiBase } from '../config/api.js';

const WS_BASE = (import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || getApiBase()).replace(/^http/, 'ws');

function fmtCents(c) {
  if (c == null || c === undefined) return '$0';
  return '$' + (c / 100).toFixed(2);
}

export function AuctionPanel({ streamId, creatorId, refreshTrigger, className = '' }) {
  const { t } = useTranslation();
  const me = getUser();
  const [auction, setAuction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bidding, setBidding] = useState(false);
  const [bidError, setBidError] = useState(null);
  const wsRef = useRef(null);

  const loadAuction = useCallback(async () => {
    if (!streamId) return;
    setLoading(true);
    try {
      const a = await fetchStreamLiveAuction(streamId);
      setAuction(a);
    } catch {
      setAuction(null);
    } finally {
      setLoading(false);
    }
  }, [streamId]);

  useEffect(() => {
    loadAuction();
  }, [loadAuction, refreshTrigger]);

  useEffect(() => {
    if (!auction?._id) return;
    const token = getToken();
    const wsUrl = `${WS_BASE}/ws/auction/${auction._id}${token ? `?token=${token}` : ''}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if ((msg.type === 'bid' || msg.type === 'new_bid') && msg.auction) {
        setAuction(msg.auction);
        setBidding(false);
      }
      if (msg.type === 'auction_ended' && msg.auction) setAuction(msg.auction);
      if (msg.type === 'auction_started' && msg.auction) setAuction(msg.auction);
      if (msg.type === 'bid_error') {
        setBidError(msg.error || t('auctions.bidFailed'));
        setBidding(false);
      }
    });
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [auction?._id]);

  const handleBid = async () => {
    if (!auction || !me) return;
    setBidError(null);
    const current = auction.currentBidCents ?? auction.startBidCents ?? 0;
    const minBid = current + 100;
    setBidding(true);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'bid', data: { amount: minBid / 100, amountCents: minBid } }));
      return;
    }
    try {
      const res = await placeBid(auction._id, minBid);
      setAuction(res.auction);
    } catch (e) {
      setBidError(e.message || t('auctions.bidFailed'));
    } finally {
      setBidding(false);
    }
  };

  if (loading || !auction) return null;
  if (auction.status !== 'live') return null;

  const currentBid = auction.currentBidCents ?? auction.startBidCents ?? 0;
  const minBid = currentBid + 100;
  const ended = auction.status === 'ended';

  return (
    <div className={`absolute bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-72 z-10 ${className}`}>
      <div className="rounded-xl bg-black/80 backdrop-blur-sm border border-white/20 p-4 text-white shadow-xl">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="font-bold text-sm truncate">{auction.title}</h3>
            <p className="text-lg font-bold text-amber-400 mt-0.5">
              {ended ? fmtCents(auction.winningBidCents ?? currentBid) : fmtCents(currentBid)}
            </p>
            <p className="text-xs text-white/70">
              {ended ? t('auctions.ended') : t('auctions.currentBid')}
            </p>
          </div>
          {auction.imageUrl && (
            <img src={auction.imageUrl} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
          )}
        </div>
        {!ended && (
          <>
            <button
              type="button"
              onClick={handleBid}
              disabled={!me || bidding}
              className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {bidding ? t('auctions.bidding') : t('auctions.bidNow')} {fmtCents(minBid)}
            </button>
            {!me && (
              <p className="text-xs text-white/70 mt-2 text-center">
                <Link to="/login" className="text-amber-400 hover:underline">{t('auctions.loginRequired')}</Link>
              </p>
            )}
            {bidError && <p className="text-xs text-red-400 mt-2">{bidError}</p>}
          </>
        )}
        {ended && creatorId && (
          <Link
            to={`/creator/${creatorId}/auctions?auction=${auction._id}`}
            className="block text-center text-xs text-amber-400 hover:underline mt-2"
          >
            {t('auctions.viewResults')}
          </Link>
        )}
      </div>
    </div>
  );
}
