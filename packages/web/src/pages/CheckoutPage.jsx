/**
 * CheckoutPage — review cart, enter shipping/payment, place order.
 * Integrates with Stripe PaymentIntent or falls back to stub mode.
 * https://milloapp.com
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SEO } from '../components/SEO';
import TrustBadge from '../components/TrustBadge';
import { OperationalStubBanner } from '../components/OperationalStubBanner';
import { useFeatureStatus } from '../trust/TrustStatusContext.jsx';
import { useCart } from '../context/CartContext';
import { shopCheckout, shopCheckoutPreview } from '../sdk/contentApi';
import { getUser } from '../sdk/authApi';
import { getDeviceFingerprint } from '../lib/deviceFingerprint';

function validateShipping(s, t) {
  const errs = {};
  if (!s.name.trim())    errs.name    = t('checkout.errNameRequired');
  if (!s.address.trim()) errs.address = t('checkout.errAddressRequired');
  if (!s.city.trim())    errs.city    = t('checkout.errCityRequired');
  if (!s.zip.trim())     errs.zip     = t('checkout.errZipRequired');
  else if (!/^[A-Za-z0-9\s\-]{3,10}$/.test(s.zip.trim())) errs.zip = t('checkout.errZipInvalid');
  if (!s.country.trim())              errs.country = t('checkout.errCountryRequired');
  else if (!/^[A-Za-z]{2,3}$/.test(s.country.trim())) errs.country = t('checkout.errCountryInvalid');
  return errs;
}

function fmt(cents) { return '$' + (cents / 100).toFixed(2); }

const STEPS = ['Review', 'Shipping', 'Payment', 'Confirmation'];

export function CheckoutPage() {
  const { t }             = useTranslation();
  const navigate          = useNavigate();
  const [searchParams]    = useSearchParams();
  const { items, totalCents, clearCart } = useCart();
  const user              = getUser();
  const [step,     setStep]    = useState(0);
  const [shipping, setShipping]= useState({ name: '', address: '', city: '', country: 'US', zip: '' });
  const [fieldErrs,setFieldErrs] = useState({});
  const [busy,     setBusy]    = useState(false);
  const [error,    setError]   = useState(null);
  const [orderId,  setOrderId] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [orderViaStub, setOrderViaStub] = useState(false);
  const payTruth = useFeatureStatus('payments');

  const shippingValid = useMemo(() => Object.keys(validateShipping(shipping, t)).length === 0, [shipping, t]);

  // Phase 3: Fetch checkout breakdown when we have shipping (for VAT, platform fee, total)
  useEffect(() => {
    if (step >= 2 && shipping.country && items.length > 0) {
      shopCheckoutPreview(
        items.map((i) => ({ id: i.id, productId: i.id, qty: i.qty })),
        shipping
      ).then((res) => setBreakdown(res?.breakdown)).catch(() => setBreakdown(null));
    } else {
      setBreakdown(null);
    }
  }, [step, shipping.country, items]);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!user) { navigate('/login', { replace: true, state: { from: '/checkout' } }); }
  }, [user, navigate]);

  // Handle return from Stripe Checkout
  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (sessionId) {
      clearCart();
      setOrderId(sessionId.slice(-12).toUpperCase());
      setStep(3);
    }
  }, [searchParams, clearCart]);

  if (items.length === 0 && step < 3) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <p className="text-[var(--text-muted)] text-lg">{t('checkout.cartEmpty')}</p>
        <Link to="/feed" className="mt-4 inline-block text-[var(--accent)] font-medium hover:underline">
          {t('checkout.backToShop')}
        </Link>
      </div>
    );
  }

  const handlePlaceOrder = async () => {
    setBusy(true);
    setError(null);
    try {
      const fingerprint = await getDeviceFingerprint();
      const res = await shopCheckout(
        items.map((i) => ({ id: i.id, name: i.name, priceCents: i.priceCents, qty: i.qty, imageUrl: i.imageUrl })),
        shipping,
        fingerprint || undefined
      );
      if (res.stub) {
        setOrderViaStub(true);
        setOrderId(res.orderId);
        clearCart();
        setStep(3);
      } else if (res.redirectUrl) {
        // Redirect to Stripe hosted checkout
        window.location.href = res.redirectUrl;
      }
    } catch (e) {
      setError(e.message || 'Payment failed. Please try again.');
    }
    setBusy(false);
  };

  return (
    <>
      <SEO title={t('checkout.seoTitle')} description={t('checkout.seoDesc')} path="/checkout" />
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold text-[var(--text)]">{t('checkout.title')}</h1>
          <span className="text-xs text-[var(--text-muted)]">{t('checkout.paymentsRail', 'Payments')}</span>
          <TrustBadge feature="payments" />
        </div>
        <OperationalStubBanner features={['payments', 'email', 'push']} className="mb-6" />

        {/* Step indicator */}
        <div className="flex items-center gap-0 mb-8">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div className={`flex flex-col items-center ${i > 0 ? 'flex-1' : ''}`}>
                {i > 0 && (
                  <div className={`h-px flex-1 w-full ${i <= step ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'} mb-4`} />
                )}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  i < step  ? 'bg-[var(--accent)] text-white'
                  : i === step ? 'border-2 border-[var(--accent)] text-[var(--accent)]'
                  : 'border-2 border-[var(--border)] text-[var(--text-muted)]'
                }`}>
                  {i < step ? '✓' : i + 1}
                </div>
                <p className={`text-xs mt-1 ${i === step ? 'text-[var(--accent)] font-semibold' : 'text-[var(--text-muted)]'}`}>
                  {s}
                </p>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px ${i < step ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'} mt-[-12px]`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="md:col-span-2">
            {step === 0 && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h2 className="text-base font-semibold text-[var(--text)] mb-4">{t('checkout.reviewOrder')}</h2>
                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center shrink-0">
                        {item.imageUrl
                          ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover rounded-lg" />
                          : <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--text)] truncate">{item.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">{t('checkout.qty', { count: item.qty })}</p>
                      </div>
                      <p className="text-sm font-bold text-[var(--text)] shrink-0">{fmt(item.priceCents * item.qty)}</p>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => setStep(1)}
                  className="mt-5 w-full py-3 rounded-xl bg-[var(--accent)] text-white font-bold text-sm hover:bg-[var(--accent-hover)] transition-colors">
                  {t('checkout.continueShipping')}
                </button>
              </div>
            )}

            {step === 1 && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h2 className="text-base font-semibold text-[var(--text)] mb-4">{t('checkout.shippingDetails')}</h2>
                <div className="space-y-3">
                  {[
                    { key: 'name',    label: t('checkout.fullName'),    placeholder: 'Jane Doe'    },
                    { key: 'address', label: t('checkout.address'),     placeholder: '123 Main St' },
                    { key: 'city',    label: t('checkout.city'),        placeholder: 'New York'    },
                    { key: 'zip',     label: t('checkout.zip'),         placeholder: '10001'       },
                    { key: 'country', label: t('checkout.countryCode'), placeholder: 'US'          },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{label}</label>
                      <input
                        type="text"
                        value={shipping[key]}
                        onChange={(e) => {
                          setShipping((s) => ({ ...s, [key]: e.target.value }));
                          setFieldErrs((prev) => { const n = { ...prev }; delete n[key]; return n; });
                        }}
                        onBlur={() => setFieldErrs((prev) => ({ ...prev, ...validateShipping(shipping, t) }))}
                        placeholder={placeholder}
                        className={`w-full rounded-xl border px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 bg-[var(--bg-elevated)] ${
                          fieldErrs[key] ? 'border-red-400 focus:ring-red-400' : 'border-[var(--border)] focus:ring-[var(--accent)]'
                        }`}
                      />
                      {fieldErrs[key] && <p className="text-xs text-red-500 mt-1">{fieldErrs[key]}</p>}
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mt-5">
                  <button type="button" onClick={() => setStep(0)}
                    className="flex-1 py-3 rounded-xl border border-[var(--border)] text-[var(--text)] font-medium text-sm hover:bg-[var(--bg-elevated)] transition-colors">
                    {t('common.back')}
                  </button>
                  <button type="button"
                    onClick={() => { const errs = validateShipping(shipping, t); setFieldErrs(errs); if (!Object.keys(errs).length) setStep(2); }}
                    className="flex-1 py-3 rounded-xl bg-[var(--accent)] text-white font-bold text-sm hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                    disabled={!shippingValid}>
                    {t('checkout.continuePayment')}
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h2 className="text-base font-semibold text-[var(--text)] mb-2">{t('checkout.payment')}</h2>
                {(payTruth === 'BETA' || payTruth === 'DISABLED') && (
                  <p className="mb-3 text-xs text-amber-600 dark:text-amber-400 font-medium">
                    {t('checkout.stubPaymentStep', 'You are not using live card processing until payments show as verified live.')}
                  </p>
                )}
                <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] mb-4 text-sm text-[var(--text-muted)] space-y-1">
                  <p><span className="font-medium text-[var(--text)]">{t('checkout.shippingTo')}:</span> {shipping.name}, {shipping.address}, {shipping.city} {shipping.zip}, {shipping.country}</p>
                  {breakdown?.formatted ? (
                    <div className="mt-2 pt-2 border-t border-[var(--border)] space-y-0.5">
                      <p><span className="font-medium text-[var(--text)]">{t('checkout.productPrice')}:</span> {breakdown.formatted.productPrice}</p>
                      {breakdown.formatted.vat && <p><span className="font-medium text-[var(--text)]">{t('checkout.vat')}:</span> {breakdown.formatted.vat}</p>}
                      <p><span className="font-medium text-[var(--text)]">{t('checkout.platformFee')}:</span> {breakdown.formatted.platformFee}</p>
                      <p className="font-bold text-[var(--text)]"><span>{t('checkout.total')}:</span> {breakdown.formatted.total}</p>
                    </div>
                  ) : (
                    <p><span className="font-medium text-[var(--text)]">{t('checkout.items')}:</span> {items.length} item{items.length !== 1 ? 's' : ''} — <strong className="text-[var(--text)]">{fmt(totalCents)}</strong></p>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <p className="text-xs text-blue-400">
                    {t('checkout.stripeRedirectNote')}
                  </p>
                </div>

                {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

                <div className="flex gap-3 mt-5">
                  <button type="button" onClick={() => setStep(1)}
                    className="flex-1 py-3 rounded-xl border border-[var(--border)] text-[var(--text)] font-medium text-sm hover:bg-[var(--bg-elevated)] transition-colors">
                    {t('common.back')}
                  </button>
                  <button type="button" onClick={handlePlaceOrder} disabled={busy}
                    className="flex-1 py-3 rounded-xl bg-[var(--accent)] text-white font-bold text-sm hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {busy
                      ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {t('checkout.redirecting')}</>
                      : t('checkout.payViaStripe', { amount: breakdown?.formatted?.total || fmt(totalCents) })
                    }
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="rounded-2xl border border-green-300 dark:border-green-500/30 bg-green-50 dark:bg-green-500/10 p-8 text-center">
                {orderViaStub && (
                  <div className="mb-4 rounded-lg border border-amber-500/50 bg-amber-100/80 dark:bg-amber-500/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-100 text-left">
                    {t(
                      'checkout.stubOrderConfirmedBanner',
                      'This order was completed in stub/demo mode — no real payment was captured. Do not ship goods or expect a real charge.'
                    )}
                  </div>
                )}
                <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-[var(--text)] mb-2">{t('checkout.orderConfirmed')}</h2>
                <p className="text-sm text-[var(--text-muted)] mb-1">{t('checkout.orderIdLabel')}: <strong className="font-mono">{orderId}</strong></p>
                <p className="text-sm text-[var(--text-muted)] mb-6">{t('checkout.confirmationEmail')}</p>
                <Link to="/feed"
                  className="inline-block px-6 py-3 rounded-xl bg-[var(--accent)] text-white font-bold text-sm hover:bg-[var(--accent-hover)] transition-colors">
                  {t('checkout.continueShopping')}
                </Link>
              </div>
            )}
          </div>

          {/* Order summary sidebar */}
          {step < 3 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 h-fit">
              <h3 className="text-sm font-semibold text-[var(--text)] mb-3">{t('checkout.orderSummary')}</h3>
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm text-[var(--text-muted)]">
                    <span className="truncate max-w-[130px]">{item.name} ×{item.qty}</span>
                    <span className="shrink-0 ml-2 font-medium text-[var(--text)]">{fmt(item.priceCents * item.qty)}</span>
                  </div>
                ))}
              </div>
              {breakdown?.formatted && (
                <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-1 text-sm">
                  <div className="flex justify-between text-[var(--text-muted)]">
                    <span>{t('checkout.productPrice')}</span>
                    <span>{breakdown.formatted.productPrice}</span>
                  </div>
                  {breakdown.formatted.vat && (
                    <div className="flex justify-between text-[var(--text-muted)]">
                      <span>{t('checkout.vat')}</span>
                      <span>{breakdown.formatted.vat}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[var(--text-muted)]">
                    <span>{t('checkout.platformFee')}</span>
                    <span>{breakdown.formatted.platformFee}</span>
                  </div>
                </div>
              )}
              <div className="mt-4 pt-4 border-t border-[var(--border)] flex justify-between">
                <span className="text-sm font-semibold text-[var(--text)]">{t('checkout.total')}</span>
                <span className="text-base font-extrabold text-[var(--text)]">{breakdown?.formatted?.total || fmt(totalCents)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
