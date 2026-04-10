# Phase 9 — Billing & Ledger

**Owns:** Stripe integration, PayPal integration, Webhook verification, Idempotency enforcement, Payout workers, Admin approval flow.  
**Depends on:** Phase 6.

---

## Stripe integration

- **createCharge(amountCents, idempotencyKey, meta)** — idempotent; logs FinancialAuditLog (action: stripe_charge).
- **createPayout(amountCents, idempotencyKey, meta)** — idempotent; logs FinancialAuditLog (action: stripe_payout).
- **Location:** `packages/billing/src/stripe.js`.

## PayPal integration

- **createPayout(amountCents, idempotencyKey, meta)** — idempotent; logs FinancialAuditLog (action: paypal_payout).
- **Location:** `packages/billing/src/paypal.js`.

## Webhook verification

- **verifyStripeWebhook(payload, signature, secret)** — verifies Stripe-Signature (t=timestamp,v1=hmac). HMAC-SHA256 of `timestamp.payload` with endpoint secret; returns true/false.
- **verifyPayPalWebhook(payload, headers)** — verifies PayPal webhook (stub: requires payload and transmission headers; production may use PayPal verification API).
- **Location:** `packages/billing/src/webhooks.js`. Use before processing webhook body; reject requests that fail verification.

## Idempotency enforcement

- **executeWithIdempotency(key, fn)** — if key exists in IdempotencyRecord, return stored result; else run fn(), store result, return. TTL 24h. Used by Stripe/PayPal charge and payout.
- **Location:** `packages/billing/src/idempotency.js`. Schema: IdempotencyRecord (key, result, status, expiresAt).

## Payout workers

- **Queue:** `payout-retry` (BullMQ). **Worker:** `packages/workers/src/payout-retry-worker.js` — job data `{ payoutId }`; calls `billing.processRetry(payoutId)`.
- **processRetry(payoutId)**, **getPayoutsForRetry()**, **markPayoutFailed(payoutId)** — **Location:** `packages/billing/src/retryWorker.js`.

## Admin approval flow

- **requestPayout(userId, amountCents, provider, idempotencyKey)** — creates PayoutRequest (status: pending). Same idempotencyKey returns existing (no duplicate).
- **approvePayout(payoutId, adminId, overrideReason)** — sets approved, writes AdminAuditLog (payout_approve), calls Stripe/PayPal createPayout, sets paid, writes FinancialAuditLog (payout_paid).
- **rejectPayout(payoutId, adminId, overrideReason)** — sets rejected, writes AdminAuditLog (payout_reject).
- **Location:** `packages/billing/src/payouts.js`. Schema: PayoutRequest (userId, amountCents, provider, idempotencyKey, status, approvedBy, approvedAt, paidAt, externalId).

## Validation

- **No duplicate payouts:** Same idempotencyKey returns same PayoutRequest. **Audit trail:** approvePayout creates AdminAuditLog and FinancialAuditLog.
- **Webhook verification:** verifyStripeWebhook validates HMAC; verifyPayPalWebhook requires transmission headers. Unit tests in `packages/billing/src/billing.test.js`.

Run: `node --test packages/billing/src/billing.test.js` from repo root (requires MongoDB for payout tests).

---

*Phase 9 complete. Proceed to next phase in specified order.*
