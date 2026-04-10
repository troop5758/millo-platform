/**
 * OrdersPage — implicit route `/orders`
 * Shows authenticated user's orders from GET /shop/orders.
 *
 * https://milloapp.com
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../../components/SEO';
import { getUser } from '../../sdk/authApi';
import { fetchOrders } from '../../sdk/contentApi';

export function OrdersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getUser();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true, state: { from: '/orders' } });
      return;
    }
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const status = searchParams.get('status') || undefined;
        // fetchOrders currently exposes only limit/offset. If a status filter is needed,
        // we fall back to server-side default listing (all statuses).
        const list = await fetchOrders(20, 0);
        setOrders(Array.isArray(list) ? list : []);
        if (status) {
          // Best-effort client-side filter to keep this page connected.
          setOrders((prev) => prev.filter((o) => o.status === status));
        }
      } catch (e) {
        setError(e.message || 'Failed to load orders');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, navigate, searchParams]);

  return (
    <>
      <SEO title={t('shop.orders', 'Orders')} path="/orders" />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-[var(--text)] mb-6">{t('shop.orders', 'Orders')}</h1>

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
          <div className="space-y-3">
            {orders.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">{t('shop.noOrders', 'No orders found.')}</p>
            ) : (
              orders.map((o) => (
                <div key={o._id || o.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-[var(--text)]">{o.status || '—'}</div>
                      <div className="text-xs text-[var(--text-muted)] mt-1">
                        {o.createdAt ? new Date(o.createdAt).toLocaleString() : '—'}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-2">
                        Items: {o.itemsCount ?? o.items?.length ?? o.lineItems?.length ?? '—'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-[var(--text)]">
                        {o.totalCents != null ? `$${(o.totalCents / 100).toFixed(2)}` : (o.total != null ? o.total : '—')}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-1">
                        #{String(o._id || o.id).slice(-8)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}

