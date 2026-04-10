/**
 * AuctionLiveListPage — implicit route `/auction/live`
 * Lists active/live auctions using GET /shop/auctions?status=live.
 *
 * https://milloapp.com
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../../components/SEO';
import { fetchAuctions } from '../../sdk/contentApi';

function fmtCents(c) {
  if (c == null) return '$0.00';
  return '$' + (c / 100).toFixed(2);
}

export function AuctionLiveListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [auctions, setAuctions] = useState([]);

  const pageSize = 20;
  const offset = Number(searchParams.get('offset') || 0);

  useEffect(() => {
    let mounted = true;
    async function run() {
      setLoading(true);
      setError('');
      try {
        const list = await fetchAuctions('live', pageSize, offset);
        if (!mounted) return;
        setAuctions(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!mounted) return;
        setError(e.message || 'Failed to load auctions');
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }
    run();
    return () => {
      mounted = false;
    };
  }, [offset]);

  return (
    <>
      <SEO title={t('auctions.live', 'Live Auctions')} path="/auction/live" />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text)]">{t('auctions.live', 'Live Auctions')}</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">{t('auctions.liveDesc', 'Bidding is open now.')}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-sm text-[var(--accent)] hover:underline font-medium"
          >
            {t('common.back', 'Back')}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-[var(--error)]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {auctions.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">{t('auctions.noAuctions', 'No live auctions right now.')}</p>
            ) : (
              auctions.map((a) => (
                <Link
                  key={a._id}
                  to={`/auction/${encodeURIComponent(a._id)}`}
                  className="text-left rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden hover:border-[var(--accent)] hover:-translate-y-0.5 transition-all"
                >
                  <div className="relative aspect-video bg-[var(--bg-elevated)] flex items-center justify-center overflow-hidden">
                    {a.imageUrl ? (
                      <img src={a.imageUrl} alt={a.title} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-5xl">🛍</span>
                    )}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white">
                      LIVE
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="font-semibold text-[var(--text)] truncate">{a.title}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-xs text-[var(--text-muted)]">{t('auctions.currentBid', 'Current bid')}</div>
                      <div className="text-sm font-bold text-[var(--accent)]">
                        {fmtCents(a.currentBidCents ?? a.startBidCents)}
                      </div>
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-2">
                      Ends: {a.endsAt ? new Date(a.endsAt).toLocaleString() : '—'}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}

