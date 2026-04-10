import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../../components/SEO';
import { fetchCreator, fetchProduct } from '../../sdk/contentApi';

function fmtCents(cents) {
  if (cents == null) return null;
  if (!Number.isFinite(cents)) return null;
  return '$' + (cents / 100).toFixed(2);
}

export function ProductPage() {
  const { id } = useParams(); // implicit route /product/:id
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [product, setProduct] = useState(null);
  const [creatorProfile, setCreatorProfile] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function run() {
      setLoading(true);
      setError('');
      setProduct(null);
      setCreatorProfile(null);

      try {
        if (!id) throw new Error('Missing product id');
        const p = await fetchProduct(id);
        if (!mounted) return;
        setProduct(p || null);

        const creatorId = p?.creatorId || p?.creator || p?.creator_id;
        if (creatorId) {
          try {
            const c = await fetchCreator(creatorId);
            if (!mounted) return;
            setCreatorProfile(c || null);
          } catch {
            // Creator profile is optional; product itself is the primary target.
          }
        }
      } catch (e) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load product');
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    run();
    return () => {
      mounted = false;
    };
  }, [id]);

  const creatorId = useMemo(() => {
    if (!product) return null;
    return product.creatorId || product.creator || product.creator_id || null;
  }, [product]);

  const creatorName = creatorProfile?.displayName || creatorId || '';
  const productName = product?.name || t('product.productDetails', { defaultValue: 'Product' });
  const productDesc = product?.description || '';
  const productImg = product?.imageUrls?.[0] || product?.imageUrl || product?.thumbnailUrl || null;
  const price = fmtCents(product?.priceCents);
  const inventory = product?.inventory ?? null;

  return (
    <>
      <SEO
        title={`${productName} – Millo`}
        description={productDesc.slice(0, 150)}
        path={`/product/${id || ''}`}
        image={productImg || undefined}
      />

      <div className="min-h-screen bg-[#f0f2f7]">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-6">
            <Link to={creatorId ? `/store/${encodeURIComponent(creatorId)}` : '/feed'} className="text-sm font-semibold text-blue-600 hover:underline">
              {t('product.backToStore', { defaultValue: 'Back to store' })}
            </Link>
          </div>

          {loading ? (
            <div className="min-h-[40vh] flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error || !product ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
              <div className="text-4xl mb-2">📦</div>
              <h1 className="text-lg font-bold text-slate-800">{t('product.notFound', { defaultValue: 'Product not found' })}</h1>
              {error ? <p className="text-sm text-slate-600 mt-2">{error}</p> : null}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white">
                <div className="aspect-square bg-slate-100 flex items-center justify-center">
                  {productImg ? (
                    <img src={productImg} alt={productName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-6xl" aria-hidden>
                      📦
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h1 className="text-2xl font-extrabold text-slate-800">{productName}</h1>
                  {creatorName ? (
                    <p className="text-sm text-slate-500 mt-1">
                      {t('product.soldBy', { defaultValue: 'Sold by' })}:
                      <Link to={creatorId ? `/store/${encodeURIComponent(creatorId)}` : '#'} className="ml-2 text-blue-600 hover:underline">
                        {creatorName}
                      </Link>
                    </p>
                  ) : null}
                </div>

                {price ? <div className="text-3xl font-extrabold text-blue-600">{price}</div> : null}
                {inventory != null && Number.isFinite(inventory) && inventory > 0 ? (
                  <div className="text-sm font-semibold text-green-600">{inventory} in stock</div>
                ) : null}

                {productDesc ? (
                  <p className="text-sm text-slate-600">{productDesc}</p>
                ) : null}

                {creatorId ? (
                  <Link
                    to={`/creator/${encodeURIComponent(creatorId)}/shop/${encodeURIComponent(id)}`}
                    className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
                  >
                    {t('product.openFullDetails', { defaultValue: 'Open full details' })}
                  </Link>
                ) : (
                  <span className="text-sm text-slate-500">
                    {t('product.noCreator', { defaultValue: 'Creator information unavailable.' })}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

