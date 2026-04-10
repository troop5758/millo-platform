import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import { fetchProduct, fetchCreator, shopBuyNow } from '../sdk/contentApi';
import { useCart } from '../context/CartContext';
import { getDeviceFingerprint } from '../lib/deviceFingerprint';
import TrustBadge from '../components/TrustBadge';
import { OperationalStubBanner } from '../components/OperationalStubBanner';


function StarRating({ rating, size = 'text-base' }) {
  return (
    <span className={size} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={s <= rating ? 'text-amber-400' : 'text-slate-300'}>★</span>
      ))}
    </span>
  );
}

export function ProductDetailPage() {
  const { t }              = useTranslation();
  const { id, productId } = useParams();
  const navigate           = useNavigate();
  const [tab,        setTab]        = useState('description');
  const [qty,        setQty]        = useState(1);
  const [wishlist,   setWishlist]   = useState(false);
  const [dark,       setDark]       = useState(true);
  const [thumb,      setThumb]      = useState(0);
  const [product,    setProduct]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [videoOpen,  setVideoOpen]  = useState(false);
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [buyNowBusy, setBuyNowBusy] = useState(false);
  const [buyNowError, setBuyNowError] = useState(null);
  const { addItem } = useCart();



  useEffect(() => {
    if (!productId) { setLoading(false); return; }
    fetchProduct(productId)
      .then((p) => {
        setProduct(p);
        if (p?.creatorId) {
          fetchCreator(p.creatorId)
            .then((creator) => setCreatorProfile(creator))
            .catch(() => null);
        }
      })
      .catch(() => { setProduct(null); setFetchError(true); })
      .finally(() => setLoading(false));
  }, [productId]);

  const handleAddToCart = () => {
    if (!product) return;
    addItem({
      id:         product._id,
      name:       product.name,
      priceCents: product.priceCents,
      imageUrl:   product.imageUrls?.[0] || null,
    });
  };

  const handleBuyNow = async () => {
    if (!product) return;
    setBuyNowBusy(true);
    setBuyNowError(null);
    try {
      const fingerprint = await getDeviceFingerprint();
      const res = await shopBuyNow(product._id, qty, fingerprint || undefined);
      if (res.stub) {
        navigate('/checkout/success?session_id=dev_' + res.orderId);
      } else if (res.redirectUrl) {
        window.location.href = res.redirectUrl;
      }
    } catch (e) {
      setBuyNowError(e.message || 'Could not start checkout. Please try again.');
    }
    setBuyNowBusy(false);
  };

  const scheme = dark
    ? { bg: '#111', card: '#1a1a1a', border: '#2e2e2e', text: '#fff', muted: '#94a3b8', inputBg: '#232323' }
    : { bg: '#f0f2f7', card: '#fff', border: '#e2e8f0', text: '#0f172a', muted: '#64748b', inputBg: '#f8fafc' };

  // Use real product data if loaded, fall back to placeholder display names
  const productName  = product?.name        || t('product.productDetails');
  const productPrice = product?.priceCents != null ? '$' + (product.priceCents / 100).toFixed(2) : null;
  const productDesc  = product?.description || '';
  const productImg   = product?.imageUrls?.[0] || null;
  const productInv   = product?.inventory ?? -1;

  const tabs = [
    { key: 'description',    label: t('product.description') },
    ...(product?.specs?.length > 0 ? [{ key: 'specifications', label: t('product.specifications') }] : []),
  ];

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: scheme.bg }}>
      <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (fetchError || (!loading && !product)) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6" style={{ backgroundColor: scheme.bg }}>
      <span className="text-5xl">📦</span>
      <h2 className="text-xl font-bold" style={{ color: scheme.text }}>{t('product.notFound')}</h2>
      <p className="text-sm text-center" style={{ color: scheme.muted }}>
        {t('product.notFoundDesc')}
      </p>
      <Link to={id ? `/creator/${id}/shop` : '/feed'}
        className="mt-2 px-5 py-2.5 rounded-xl font-semibold text-sm"
        style={{ backgroundColor: '#f59e0b', color: '#1a1a1a' }}>
        {t('product.backToShop')}
      </Link>
    </div>
  );

  return (
    <>
      <SEO
        title={`${productName} – Millo`}
        description={productDesc.slice(0, 150)}
        path={'/creator/' + id + '/shop/' + productId}
        image={productImg || undefined}
      />
      <div style={{ minHeight: '100vh', backgroundColor: scheme.bg, color: scheme.text, transition: 'background 0.2s, color 0.2s' }}>

        {/* ── Top bar ── */}
        <div style={{ backgroundColor: scheme.card, borderBottom: `1px solid ${scheme.border}` }}
          className="sticky top-0 z-20 px-4 py-3 flex items-center justify-between">
          <Link to={'/creator/' + id + '/shop'}
            className="flex items-center gap-2 text-sm font-semibold hover:opacity-80 transition-opacity"
            style={{ color: scheme.text }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('product.productDetails')}
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: scheme.muted }}>{t('product.darkMode')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={dark}
              onClick={() => setDark((d) => !d)}
              className="relative w-12 h-6 rounded-full transition-colors"
              style={{ backgroundColor: dark ? scheme.border : '#e2e8f0' }}
            >
              <span
                className="absolute top-1 w-4 h-4 rounded-full transition-transform"
                style={{
                  backgroundColor: dark ? '#f59e0b' : '#94a3b8',
                  transform: dark ? 'translateX(26px)' : 'translateX(4px)',
                }}
              />
            </button>
          </div>
        </div>

        {/* ── Main layout ── */}
        <div className="max-w-5xl mx-auto px-4 py-6">
          <div className="flex flex-col lg:flex-row gap-8">

            {/* Left: images */}
            <div className="lg:w-96 shrink-0">
              <div className="relative rounded-2xl overflow-hidden aspect-square flex items-center justify-center text-7xl"
                style={{ backgroundColor: scheme.card, border: `1px solid ${scheme.border}` }}>
                {product?.imageUrls?.[thumb] || productImg
                  ? <img src={product?.imageUrls?.[thumb] || productImg} alt={productName} className="w-full h-full object-cover" />
                  : <span aria-hidden>📦</span>
                }
              </div>
              {product?.videoUrl && (
                <button type="button"
                  onClick={() => setVideoOpen(true)}
                  className="mt-3 flex items-center gap-2 text-sm font-medium hover:opacity-80 transition-opacity"
                  style={{ color: '#3b82f6' }}>
                  <span className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs"
                    style={{ borderColor: '#3b82f6' }} aria-hidden>▶</span>
                  {t('product.watchVideo')}
                </button>
              )}
              {product?.imageUrls?.length > 1 && (
                <div className="flex gap-2 mt-3">
                  {product.imageUrls.map((url, i) => (
                    <button key={i} type="button" onClick={() => setThumb(i)}
                      className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center text-2xl transition-all"
                      style={{
                        backgroundColor: scheme.inputBg,
                        border: `2px solid ${thumb === i ? '#f59e0b' : scheme.border}`,
                      }}
                      aria-label={`Image ${i + 1}`}>
                      <img src={url} alt={`Product ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right: info */}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: scheme.text }}>
                {productName}
              </h1>
              {product?.rating != null && (
                <div className="flex items-center gap-2 mt-2">
                  <StarRating rating={Math.round(product.rating)} />
                  <span className="text-sm font-medium" style={{ color: scheme.muted }}>
                    {product.rating.toFixed(1)}{product.reviewCount ? ` – ${product.reviewCount.toLocaleString()} reviews` : ''}
                  </span>
                </div>
              )}

              <div className="mt-4 flex items-baseline gap-3">
                {productPrice && <span className="text-3xl font-extrabold" style={{ color: scheme.text }}>{productPrice}</span>}
              </div>
              {productInv > 0 && (
                <p className="text-sm mt-1" style={{ color: '#22c55e' }}>{productInv} in stock</p>
              )}

              {/* Seller card */}
              {(creatorProfile || product?.creatorId) && (
                <Link
                  to={`/creator/${product?.creatorId || id}`}
                  className="mt-4 flex items-center gap-3 rounded-xl px-4 py-3 hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: scheme.inputBg, border: `1px solid ${scheme.border}` }}
                >
                  {creatorProfile?.avatarUrl
                    ? <img src={creatorProfile.avatarUrl} alt={creatorProfile.displayName} className="w-10 h-10 rounded-full object-cover shrink-0" />
                    : <span className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-bold shrink-0">
                        {(creatorProfile?.displayName || 'C')[0].toUpperCase()}
                      </span>}
                  <div>
                    <p className="text-sm font-semibold flex items-center gap-1" style={{ color: scheme.text }}>
                      {creatorProfile?.displayName || t('product.creator')}
                      <span className="w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs" aria-label="Verified">✓</span>
                    </p>
                    {creatorProfile?.bio && (
                      <p className="text-xs mt-0.5 line-clamp-1" style={{ color: scheme.muted }}>{creatorProfile.bio}</p>
                    )}
                  </div>
                </Link>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-5 text-xs" style={{ color: scheme.muted }}>
                <span>{t('checkout.paymentsRail', 'Payments')}</span>
                <TrustBadge feature="payments" />
              </div>
              <OperationalStubBanner features={['payments', 'email', 'push']} className="mt-3" />

              {/* Add to cart / Buy now */}
              <div className="mt-5 flex gap-3">
                <button type="button" onClick={handleAddToCart}
                  className="flex-1 py-3 rounded-xl font-bold text-slate-900 flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#f59e0b' }}>
                  {t('product.addToCart')}
                  <span className="flex items-center justify-center w-6 h-6 rounded-md bg-amber-600 text-white text-xs font-bold">{qty}</span>
                </button>
                <button type="button"
                  className="w-10 h-12 rounded-xl flex items-center justify-center border transition-colors hover:opacity-80"
                  style={{ borderColor: scheme.border, backgroundColor: scheme.card, color: wishlist ? '#ef4444' : scheme.muted }}
                  onClick={() => setWishlist((w) => !w)}
                  aria-label="Wishlist">
                  {wishlist ? '♥' : '♡'}
                </button>
              </div>
              <button type="button" onClick={handleBuyNow}
                disabled={buyNowBusy || productInv === 0}
                className="mt-3 w-full py-3 rounded-xl font-bold border transition-colors hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ borderColor: scheme.border, backgroundColor: scheme.card, color: scheme.text }}>
                {buyNowBusy ? <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> {t('checkout.redirecting')}</> : t('product.buyNow')}
              </button>
              {buyNowError && <p className="mt-2 text-sm text-red-500">{buyNowError}</p>}

              {/* Trust badges */}
              <div className="mt-5 flex gap-4 flex-wrap">
                {[
                  { icon: '🚚', label: t('product.freeShipping'),   sub: '' },
                  { icon: '🛡', label: t('product.moneyBack'),      sub: '' },
                  { icon: '🔒', label: t('product.securePayment'),  sub: '' },
                ].map((b) => (
                  <div key={b.label} className="flex items-center gap-2 text-sm" style={{ color: scheme.muted }}>
                    <span className="text-xl" aria-hidden>{b.icon}</span>
                    <span>{b.label}</span>
                  </div>
                ))}
              </div>

              {/* Quantity */}
              <div className="mt-5">
                <p className="text-sm mb-2" style={{ color: scheme.muted }}>
                  <span className="font-semibold" style={{ color: scheme.text }}>Quantity:</span>
                  {productInv > 0 ? ` ${productInv} available` : productInv === 0 ? ' Out of stock' : ''}
                </p>
                <div className="flex items-center gap-2">
                  <button type="button"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 rounded-lg font-bold text-lg flex items-center justify-center border transition-colors hover:opacity-80"
                    style={{ borderColor: scheme.border, backgroundColor: scheme.card, color: scheme.text }}>
                    −
                  </button>
                  <span className="w-10 text-center font-semibold" style={{ color: scheme.text }}>{qty}</span>
                  <button type="button"
                    onClick={() => setQty((q) => q + 1)}
                    className="w-9 h-9 rounded-lg font-bold text-lg flex items-center justify-center border transition-colors hover:opacity-80"
                    style={{ borderColor: scheme.border, backgroundColor: scheme.card, color: scheme.text }}>
                    +
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="mt-8 border-t" style={{ borderColor: scheme.border }}>
                <div className="flex gap-6 mt-4 overflow-x-auto border-b" style={{ borderColor: scheme.border }}>
                  {tabs.map((tabItem) => (
                    <button key={tabItem.key} type="button" onClick={() => setTab(tabItem.key)}
                      className="shrink-0 pb-3 text-sm font-semibold transition-colors"
                      style={{
                        color: tab === tabItem.key ? scheme.text : scheme.muted,
                        borderBottom: tab === tabItem.key ? '2px solid #f59e0b' : '2px solid transparent',
                      }}>
                      {tabItem.label}
                    </button>
                  ))}
                </div>

                {tab === 'description' && (
                  <div className="mt-4 space-y-3" style={{ color: scheme.muted }}>
                    <p>{productDesc || t('product.noDesc')}</p>
                    {product?.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {product.tags.map((tag) => (
                          <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-amber-400/10 text-amber-500">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tab === 'specifications' && (
                  <div className="mt-4">
                    {product?.specs?.length > 0 ? (
                      <table className="w-full text-sm">
                        <tbody>
                          {product.specs.map((s, i) => (
                            <tr key={i} style={{ borderBottom: `1px solid ${scheme.border}` }}>
                              <td className="py-2.5 pr-4 font-medium w-1/2" style={{ color: scheme.muted }}>{s.label}</td>
                              <td className="py-2.5" style={{ color: scheme.text }}>{s.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="mt-4 text-sm" style={{ color: scheme.muted }}>{t('product.noSpecs')}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Video modal */}
      {videoOpen && product?.videoUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setVideoOpen(false)}>
          <div className="w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <video
              src={product.videoUrl}
              controls
              autoPlay
              className="w-full aspect-video bg-black"
            />
            <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: scheme.card }}>
              <p className="text-sm font-semibold" style={{ color: scheme.text }}>{productName}</p>
              <button type="button" onClick={() => setVideoOpen(false)}
                className="text-sm font-medium px-3 py-1.5 rounded-lg border transition-colors hover:opacity-80"
                style={{ borderColor: scheme.border, color: scheme.text }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
