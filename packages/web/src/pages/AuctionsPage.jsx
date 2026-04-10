/**
 * AuctionsPage — live auction listing + real-time bidding for a creator.
 * Uses GET /shop/creator/:id/auctions and POST /shop/auctions/:id/bid
 * Auto-refreshes every 5s when viewing an active auction.
 * https://milloapp.com
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { fetchCreatorAuctions, fetchAuction, placeBid } from '../sdk/contentApi';
import { getUser } from '../sdk/authApi';
import { getApiBase } from '../config/api.js';

function fmtCents(c) {
  if (!c && c !== 0) return '$0.00';
  return '$' + (c / 100).toFixed(2);
}

function Countdown({ endsAt }) {
  const [remaining, setRemaining] = useState('');
  const { t } = useTranslation();

  useEffect(() => {
    function tick() {
      const ms = new Date(endsAt) - Date.now();
      if (ms <= 0) { setRemaining(t('auctions.ended')); return; }
      const h  = Math.floor(ms / 3600000);
      const m  = Math.floor((ms % 3600000) / 60000);
      const s  = Math.floor((ms % 60000) / 1000);
      setRemaining(h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  const urgent = (new Date(endsAt) - Date.now()) < 300000; // < 5 min
  return (
    <span className={`font-mono font-bold ${urgent ? 'text-red-500 animate-pulse' : 'text-[var(--text)]'}`}>
      {remaining}
    </span>
  );
}

/* ── Single auction detail view ── */
function AuctionDetail({ auctionId, creatorId, onBack }) {
  const { t } = useTranslation();
  const [auction,    setAuction]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState(false);
  const [bidAmt,     setBidAmt]     = useState('');
  const [bidBusy,    setBidBusy]    = useState(false);
  const [bidMsg,     setBidMsg]     = useState(null);
  const [bidError,   setBidError]   = useState(null);
  const [wsStatus,   setWsStatus]   = useState('connecting'); // connecting | live | error
  const wsRef = useRef(null);
  const me = getUser();

  const applyAuctionUpdate = useCallback((updated) => {
    setAuction(updated);
    const minBid = ((updated.currentBidCents ?? updated.startBidCents - 1) + 1) / 100;
    setBidAmt((prev) => {
      const prevCents = Math.round(parseFloat(prev || '0') * 100);
      return prevCents <= (updated.currentBidCents || 0) ? minBid.toFixed(2) : prev;
    });
  }, []);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const a = await fetchAuction(auctionId);
      applyAuctionUpdate(a);
    } catch {
      setLoadError(true);
    }
    setLoading(false);
  }, [auctionId, applyAuctionUpdate]);

  useEffect(() => {
    load();
  }, [load]);

  // WebSocket for real-time bid updates
  useEffect(() => {
    if (!auctionId) return;
    const token = localStorage.getItem('millo_token') || '';
    const wsBase = (import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || getApiBase()).replace(/^http/, 'ws');
    const wsUrl = `${wsBase}/ws/auction/${auctionId}${token ? `?token=${token}` : ''}`;

    let ws;
    let reconnectTimer;
    let attempts = 0;

    const connect = () => {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => { setWsStatus('live'); attempts = 0; };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'bid' && msg.auction) {
            applyAuctionUpdate(msg.auction);
          } else if (msg.type === 'auction_ended' && msg.auction) {
            applyAuctionUpdate(msg.auction);
          }
        } catch { /* ignore malformed */ }
      };

      ws.onclose = () => {
        setWsStatus('error');
        // Exponential backoff reconnect (max 30s), stop after auction ends
        setAuction((prev) => {
          if (prev?.status !== 'live') return prev;
          attempts += 1;
          reconnectTimer = setTimeout(connect, Math.min(1000 * 2 ** attempts, 30000));
          return prev;
        });
      };

      ws.onerror = () => { ws.close(); };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [auctionId, applyAuctionUpdate]);

  // Fallback poll every 10s when WS is down
  useEffect(() => {
    if (wsStatus !== 'error') return;
    const id = setInterval(() => load(), 10000);
    return () => clearInterval(id);
  }, [wsStatus, load]);

  const handleBid = async () => {
    const cents = Math.round(parseFloat(bidAmt) * 100);
    const minBid = (auction.currentBidCents ?? auction.startBidCents - 1) + 1;
    setBidError(null); setBidMsg(null);
    if (!cents || cents < minBid) {
      setBidError(t('auctions.minBid', { amount: fmtCents(minBid) }));
      return;
    }
    if (!me) { setBidError(t('auctions.loginRequired')); return; }
    setBidBusy(true);
    try {
      const res = await placeBid(auctionId, cents);
      setAuction(res.auction);
      setBidMsg(t('auctions.bidPlaced', { amount: fmtCents(cents) }));
      setBidAmt(((cents + 100) / 100).toFixed(2)); // suggest next bid
    } catch (e) {
      const msg = e.message || 'Bid failed';
      if (msg.includes('402')) setBidError(t('auctions.bidTooLow'));
      else setBidError(msg.replace('API ', 'Error '));
    }
    setBidBusy(false);
  };

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (loadError || !auction) return (
    <div className="text-center py-20">
      <p className="text-[var(--text-muted)] mb-4">{loadError ? t('auctions.errorLoad') : t('common.noResults')}</p>
      {loadError && (
        <button type="button" onClick={load}
          className="px-4 py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity">
          {t('common.retry')}
        </button>
      )}
    </div>
  );

  const ended = auction.status === 'ended';
  const upcoming = auction.status === 'upcoming';
  const minBid = (auction.currentBidCents ?? auction.startBidCents - 1) + 1;
  const bidList = [...(auction.bids || [])].reverse().slice(0, 10);
  const isWinner = ended && auction.winnerId && me && String(auction.winnerId) === String(me._id);

  return (
    <div>
      <button type="button" onClick={onBack}
        className="flex items-center gap-2 text-sm text-[var(--accent)] hover:underline mb-6">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('auctions.backToShop')}
      </button>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Image + status */}
        <div>
          <div className="aspect-square rounded-2xl overflow-hidden bg-[var(--bg-card)] border border-[var(--border)] flex items-center justify-center relative">
            {auction.imageUrl
              ? <img src={auction.imageUrl} alt={auction.title} className="w-full h-full object-cover" />
              : <span className="text-8xl">🛍</span>}
            <div className="absolute top-3 left-3 flex gap-2">
              {auction.status === 'live' && (
                <span className="px-2 py-1 rounded-lg bg-red-500 text-white text-xs font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  LIVE
                </span>
              )}
              {ended && (
                <span className="px-2 py-1 rounded-lg bg-slate-700 text-white text-xs font-bold">ENDED</span>
              )}
              {upcoming && (
                <span className="px-2 py-1 rounded-lg bg-blue-600 text-white text-xs font-bold">UPCOMING</span>
              )}
            </div>
          </div>
        </div>

        {/* Info + bidding */}
        <div className="space-y-5">
          <h1 className="text-2xl font-bold text-[var(--text)]">{auction.title}</h1>
          {auction.description && (
            <p className="text-sm text-[var(--text-muted)]">{auction.description}</p>
          )}

          {/* Bid stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <p className="text-xs text-[var(--text-muted)] mb-1">{t('auctions.currentBid')}</p>
              <p className="text-2xl font-extrabold text-[var(--accent)]">
                {fmtCents(auction.currentBidCents ?? auction.startBidCents)}
              </p>
              {auction.currentBidCents == null && (
                <p className="text-xs text-[var(--text-muted)]">{t('auctions.startingPrice')}</p>
              )}
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              {ended
                ? <p className="text-xs text-[var(--text-muted)] mb-1">{t('auctions.finalResult')}</p>
                : upcoming
                  ? <p className="text-xs text-[var(--text-muted)] mb-1">{t('auctions.startsIn')}</p>
                  : <p className="text-xs text-[var(--text-muted)] mb-1">{t('auctions.timeRemaining')}</p>
              }
              {ended
                ? <p className="text-lg font-bold text-[var(--text)]">{fmtCents(auction.winningBidCents)}</p>
                : <Countdown endsAt={auction.endsAt} />
              }
            </div>
          </div>

          {/* Winner banner */}
          {ended && (
            <div className={`rounded-xl p-4 ${isWinner ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-[var(--bg-card)] border border-[var(--border)]'}`}>
              {isWinner
                ? <p className="text-emerald-500 font-bold">🎉 {t('auctions.wonAuction', { amount: fmtCents(auction.winningBidCents) })}</p>
                : auction.winningBidCents
                  ? <p className="text-sm text-[var(--text-muted)]">{t('auctions.endedWinningBid')} <strong className="text-[var(--text)]">{fmtCents(auction.winningBidCents)}</strong></p>
                  : <p className="text-sm text-[var(--text-muted)]">{t('auctions.endedNoBids')}</p>
              }
            </div>
          )}

          {/* Bid form */}
          {auction.status === 'live' && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h3 className="text-sm font-semibold text-[var(--text)] mb-3">{t('auctions.placeBid')}</h3>
              <p className="text-xs text-[var(--text-muted)] mb-3">{t('auctions.minimumBid')}: <strong className="text-[var(--text)]">{fmtCents(minBid)}</strong></p>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] text-sm">$</span>
                  <input
                    type="number"
                    min={(minBid / 100).toFixed(2)}
                    step="0.01"
                    value={bidAmt}
                    onChange={(e) => setBidAmt(e.target.value)}
                    className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    placeholder={(minBid / 100).toFixed(2)}
                    onKeyDown={(e) => e.key === 'Enter' && handleBid()}
                  />
                </div>
                <button type="button" onClick={handleBid} disabled={bidBusy || !bidAmt}
                  className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-bold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 flex items-center gap-2">
                  {bidBusy
                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />{t('auctions.bidding')}</>
                    : t('auctions.bidNow')
                  }
                </button>
              </div>
              {bidMsg && <p className="text-emerald-500 text-sm mt-2">{bidMsg}</p>}
              {bidError && <p className="text-red-500 text-sm mt-2">{bidError}</p>}
              {!me && (
                <p className="text-sm text-[var(--text-muted)] mt-2">
                  <Link to="/login" className="text-[var(--accent)] hover:underline">Sign in</Link> to place a bid.
                </p>
              )}
            </div>
          )}

          {/* Bid history */}
          {bidList.length > 0 && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h3 className="text-sm font-semibold text-[var(--text)] mb-3">
                Bid history <span className="text-[var(--text-muted)] font-normal">({auction.bids?.length || 0} bids)</span>
              </h3>
              <div className="space-y-2">
                {bidList.map((b, i) => (
                  <div key={b._id || i} className={`flex items-center justify-between py-1.5 ${i === 0 ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-muted)]'}`}>
                    <div className="flex items-center gap-2">
                      {i === 0 && <span className="text-xs bg-[var(--accent)] text-white px-1.5 py-0.5 rounded font-bold">TOP</span>}
                      <span className="text-sm">{b.displayName || t('auctions.anonymous')}</span>
                    </div>
                    <span className="text-sm font-mono">{fmtCents(b.amountCents)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main page ── */
export function AuctionsPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAuctionId = searchParams.get('auction');

  const [auctions, setAuctions] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(false);

  useEffect(() => {
    setError(false);
    fetchCreatorAuctions(id)
      .then((a) => setAuctions(a))
      .catch(() => { setAuctions([]); setError(true); })
      .finally(() => setLoading(false));
  }, [id]);

  const handleBack = () => {
    setSearchParams({});
  };

  return (
    <>
      <SEO title={`Auctions — @${id} – Millo`} description={`Live auctions from @${id} on Millo.`} path={`/creator/${id}/auctions`} />
      <div className="max-w-6xl mx-auto px-4 py-8">

        {selectedAuctionId
          ? <AuctionDetail auctionId={selectedAuctionId} creatorId={id} onBack={handleBack} />
          : (
            <>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-bold text-[var(--text)]">{t('auctions.title')}</h1>
                  <p className="text-sm text-[var(--text-muted)] mt-0.5">{t('auctions.from', { id })}</p>
                </div>
                <Link to={`/creator/${id}/shop`}
                  className="text-sm text-[var(--accent)] hover:underline flex items-center gap-1">
                  {t('auctions.backToShop')}
                </Link>
              </div>

              {error && !loading && (
                <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t('auctions.errorLoad')}
                </div>
              )}

              {loading && (
                <div className="flex justify-center py-16">
                  <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!loading && auctions.length === 0 && (
                <div className="text-center py-20">
                  <p className="text-[var(--text-muted)] text-lg">{t('auctions.noAuctions')}</p>
                  <Link to={`/creator/${id}/shop`} className="mt-4 inline-block text-[var(--accent)] text-sm hover:underline">
                    {t('auctions.backToShop')}
                  </Link>
                </div>
              )}

              {!loading && auctions.length > 0 && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {auctions.map((a) => {
                    const ended   = a.status === 'ended';
                    const live    = a.status === 'live';
                    const upcoming = a.status === 'upcoming';
                    return (
                      <button
                        key={a._id}
                        type="button"
                        onClick={() => setSearchParams({ auction: a._id })}
                        className="text-left rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden hover:border-[var(--accent)] hover:-translate-y-0.5 transition-all"
                      >
                        {/* Thumbnail */}
                        <div className="relative aspect-video bg-[var(--bg-elevated)] flex items-center justify-center overflow-hidden">
                          {a.imageUrl
                            ? <img src={a.imageUrl} alt={a.title} className="w-full h-full object-cover" />
                            : <span className="text-5xl">🛍</span>
                          }
                          <div className="absolute top-2 left-2 flex gap-1.5">
                            {live && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />LIVE
                              </span>
                            )}
                            {upcoming && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white">SOON</span>
                            )}
                            {ended && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-600 text-white">ENDED</span>
                            )}
                          </div>
                          {!ended && (
                            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs font-mono px-2 py-0.5 rounded">
                              <Countdown endsAt={a.endsAt} />
                            </div>
                          )}
                        </div>

                        {/* Card body */}
                        <div className="p-4">
                          <h3 className="font-semibold text-[var(--text)] truncate">{a.title}</h3>
                          <div className="mt-2 flex items-center justify-between">
                            <div>
                              <p className="text-xs text-[var(--text-muted)]">
                                {a.currentBidCents ? t('auctions.currentBid') : t('auctions.startingAt')}
                              </p>
                              <p className="text-lg font-extrabold text-[var(--accent)]">
                                {fmtCents(a.currentBidCents ?? a.startBidCents)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-[var(--text-muted)]">Bids</p>
                              <p className="text-sm font-bold text-[var(--text)]">{a.bids?.length ?? 0}</p>
                            </div>
                          </div>
                          {live && (
                            <div className="mt-3 w-full py-2 rounded-xl bg-[var(--accent)] text-white text-sm font-bold text-center">
                              {t('auctions.bidNow')} →
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )
        }
      </div>
    </>
  );
}
