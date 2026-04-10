# Final execution checklist — core wallet, ads, payouts, subs, gifts, pricing

Use this before go-live. Verify in **staging** first; production must use **`https://milloapp.com`** in URLs and env where applicable.

---

## At-a-glance (final execution)

Mark each line when verified in staging/production.

**🔴 CORE**  
- [ ] Wallet system working  
- [ ] Transactions logged  

**🟠 ADS**  
- [ ] Ads injected into feed  
- [ ] CPM logic working  

**🟡 PAYOUTS**  
- [ ] Payout requests working  
- [ ] Workers processing payouts  

**🔵 SUBSCRIPTIONS**  
- [ ] Recurring billing active  

**🟣 GIFTS**  
- [ ] Live gifting working  

**⚫ PRICING**  
- [ ] Dynamic pricing active  

*Details, env flags, and smoke steps are in the sections below.*

---

## CORE

| Status | Item |
| --- | --- |
| 🔴 | Wallet system working |
| 🔴 | Transactions logged |

| Check | How to verify |
| --- | --- |
| **Wallet system working** | Balances in **cents** on `Wallet`; mutations via `@millo/economy` `credit` / `debit` (Redis lock on debit). `GET` wallet routes (e.g. economy / content wallet) return consistent `balanceCents`. |
| **Transactions logged** | `LedgerEntry` + `Transaction` on wallet moves; `PaymentTransaction` for typed commerce rows; `FinancialAuditLog` for Stripe/payout financial actions; sensitive actions on `AuditLog` via `writeAuditLog`. |

**Smoke:** coin purchase or internal credit → one debit/credit pair in ledger + `PaymentTransaction` / audit where applicable.

---

## ADS

| Status | Item |
| --- | --- |
| 🟠 | Ads injected into feed |
| 🟠 | CPM logic working |

| Check | How to verify |
| --- | --- |
| **Ads injected into feed** | `FEED_IN_FEED_ADS_ENABLED=true` (and `ADS_ENABLED` not `false`). `packages/api/src/routes/feed.js` calls `ad.service` injection after cache read. Optional: `FEED_IN_FEED_ADS_INTERVAL` (default 5 organic items between slots). |
| **CPM logic working** | `Ad` schema: `cpmCents`, `bidCents`; `packages/api/src/services/ad.service.js` — `effectiveBidCents`, `selectAd` (sort by bid/CPM). Active ads tied to **active** `Campaign` window + `placement` (e.g. `feed`). |

**Smoke:** create Campaign + Ad (`placement: feed`, `cpmCents` or `bidCents`) → `GET /feed/...` response includes injected ad rows when flag on.

---

## PAYOUTS

| Status | Item |
| --- | --- |
| 🟡 | Payout requests working |
| 🟡 | Workers processing payouts |

| Check | How to verify |
| --- | --- |
| **Payout requests working** | `POST /payments/payouts/request` or `POST /payout/request` — KYC/reputation/fraud gates; `PayoutRequest` + wallet reserve; not raw “zero balance” hacks. |
| **Workers processing payouts** | BullMQ queue **`payout-retry`** — `packages/workers/src/payout-retry-worker.js`; billing `approvePayout` / `processRetry`. Stripe/PayPal/Wise paths in `@millo/billing`. |

**Smoke:** pending `PayoutRequest` → admin approve or retry job → `FinancialAuditLog` + `AuditLog` `PAYOUT_SENT` on success.

---

## SUBSCRIPTIONS

| Status | Item |
| --- | --- |
| 🔵 | Recurring billing active |

| Check | How to verify |
| --- | --- |
| **Recurring billing active** | Creator tiers: `SubscriptionTier` with `stripePriceIdMonthly` / `stripePriceIdAnnual`. `POST /payments/subscriptions/stripe/creator` → Stripe `subscriptions.create` + `invoice.payment_succeeded` webhook splits revenue and upserts `Subscription`. Platform tiers still use `POST /payments/subscriptions/create` + Checkout. Coins path: `POST /payments/subscriptions/creator` (split via `revenue.service`). |

**Smoke:** tier with Stripe price → create subscription → pay invoice → `Subscription.externalId` set + creator/platform wallet credits.

---

## GIFTS

| Status | Item |
| --- | --- |
| 🟣 | Live gifting working |

| Check | How to verify |
| --- | --- |
| **Live gifting working** | `POST /content/gifts/send` and live WebSocket `send_gift` use `@millo/economy/src/gifts` `sendGift` — gross debit; creator + platform split (`live` tier); `paymentProtection` blocks `riskScore > FRAUD_TIER_BLOCK` on HTTP path. |

**Smoke:** send gift → sender balance down; creator credited per split; leaderboard / Kafka optional.

---

## PRICING

| Status | Item |
| --- | --- |
| ⚫ | Dynamic pricing active |

| Check | How to verify |
| --- | --- |
| **Dynamic pricing active** | **Off by default.** Set `DYNAMIC_PRICING_ENABLED=true` to apply uplift. `packages/api/src/services/pricing.service.js` — `dynamicPriceCents` / `computeDemandIndex`; wire into checkout/PPV/live price surfaces when ready. `DYNAMIC_PRICING_MAX_UPLIFT_PCT` optional (default 50). |

**Smoke:** with flag on, same base cents + high demand signals → higher quoted cents; with flag off → base unchanged.

---

## Cross-cutting (recommended)

- **Compliance:** `GET /compliance/creator/payout-requirements`; KYC webhooks; `charge.refunded` → `REFUND_PROCESSED` audit.
- **Fraud:** `FRAUD_TIER_BLOCK` (default 70); `evaluatePayment` / gift gates aligned.
- **Revenue analytics (admin):** `GET /admin/revenue/stats?from=&to=`.

---

*https://milloapp.com*
