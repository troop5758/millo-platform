# Payments System Gaps — Remediation

## 1. Payment Reference API

- **Schema**: `PaymentReference` (MongoDB) — `userId`, `provider` (stripe|paypal|wise|coin), `referenceId`, `status` (pending|completed|failed|refunded), `amount`, `amountCents`, `currency`, `metadata`, timestamps.
- **GET /payments/reference/:ref**: Authenticated lookup by reference ID. Users see only their own; admins see any. Returns 404 if not found.
- **Recording**: Stripe webhook (`payment_intent.succeeded`, `checkout.session.completed`) and coin-confirm (when using dev stub) upsert into `PaymentReference` via `paymentReferenceService.upsertPaymentReference()`.

## 2. Reconciliation API

- **GET /payments/reconciliation**: Admin/support only. Query params: `from`, `to` (ISO dates; default last 30 days).
- **Response**: `revenueCents`, `payoutsCents`, `refundsCents`, `chargebacksCents`, `chargebacksLostCents`, `netCents`, plus `from`/`to`.
- **Sources**: Revenue from `PaymentReference` (completed, provider stripe/paypal/coin); payouts from `PayoutRequest` (status paid); refunds from `PaymentReference` (status refunded); chargebacks from `Chargeback`.

## 3. Provider Abstraction Layer

- **Location**: `services/payments/` — `PaymentProvider.js` (base), `stripe.provider.js`, `paypal.provider.js`, `wise.provider.js`, `coin.provider.js`, `index.js`.
- **Unified interface**:
  - **createPayment(opts)** — create checkout/payment; alias for `createCheckout`.
  - **verifyPayment(paymentIdOrReference)** — fetch current status from provider (or DB for coin); returns `{ status, amount?, amountCents?, currency? }`.
  - **refundPayment(paymentId, amountCents?, meta)** — full or partial refund; alias for `refund`.
- **getProvider(name)**: Returns provider by name (stripe|paypal|wise|coin); default stripe.
- **getProviderWithFallback(preferred)**: Returns preferred provider or first available (fallback when primary missing).

## 4. Coin Provider

- **createPayment**: Writes a `PaymentReference` with provider `coin` and optional `referenceId`; used for internal/promo coin flows.
- **verifyPayment**: Looks up `PaymentReference` by ref, then `LedgerEntry` by `refId` / `meta.paymentIntentId` / `meta.referenceId`.
- **refundPayment**: Returns `{ status: 'not_supported' }` (coin refunds handled elsewhere if needed).

## 5. Fallback Behavior

- When a provider is not configured (e.g. no Stripe keys), existing stubs remain (e.g. Stripe returns stub session IDs). `getProviderWithFallback()` allows callers to use another provider when the preferred one is missing.
