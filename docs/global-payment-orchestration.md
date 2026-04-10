# Global Payment & Payout Orchestration Layer

**Purpose:** Orchestrate viewer payments → platform wallet → creator balance → payout processor with tax compliance, currency conversion, fraud control, automated payouts, and audit logging. Similar to Stripe/OnlyFans-style payment infrastructure for global, multi-currency operation.

**Domain:** https://milloapp.com

---

## Result — Capabilities Enabled

The Global Payment & Payout Orchestration Layer enables Millo to support:

| Capability | Implementation |
|------------|----------------|
| **Multi-currency payments** | currencyService.convertUSDToLocal, convertCurrency; CurrencyRate; paymentRouter.getCheckoutCurrency; regional pricing |
| **Creator wallets** | Wallet, CreatorWallet schemas; economy.credit/debit; balanceCents, pendingBalance, lifetimeEarnings |
| **Subscription payments** | POST /payments/subscriptions/create, /subscriptions/creator; Stripe Checkout; Subscription schema; webhook handling |
| **PPV purchases** | ppv.unlock.service, ppv.bundle.service, ppv.massMessage.service; POST /content/ppv/unlock; PpvPurchase, PpvContentPurchase |
| **Gift payments** | economy.sendGift; POST /content/gifts/send; debit sender, credit receiver; PaymentTransaction type 'gift' |
| **Storefront payments** | POST /payments/shop/buy-now, /shop/checkout; Order, Product; checkoutBreakdown; Stripe Checkout |
| **Automated payouts** | runAutomatedPayoutCycle; processPayouts; POST /payments/payouts/run-automated-cycle; cron payouts:process |
| **Tax compliance** | taxService.calculateVAT, calculateGST, generateInvoice, storeTaxRecord; TaxRecord; Avalara/TaxJar/Stripe Tax |
| **KYC/AML enforcement** | kycService.isKycApproved; CreatorKyc; gates payout request and execution; Onfido/Persona/Stripe Identity |

---

## Payment Layer Phase 1

| Requirement | Implementation | Location |
|-------------|----------------|----------|
| **Wallet system** | Wallet schema (balanceCents, lockedCents, lifetimeEarnings, currency); economy.credit/debit; getBalance | `packages/database/schemas/Wallet.js`, `packages/economy/coins.js` |
| **Transaction logging** | LedgerEntry (append-only), Transaction (wallet-level), PaymentTransaction (payment-level), FinancialAuditLog | `packages/economy/ledger.js`, `packages/database/schemas/Transaction.js`, `PaymentTransaction.js`, `FinancialAuditLog.js` |
| **Payment processing** | processPayment (platform fee, creator allocation); POST /payments/complete | `packages/api/services/paymentOrchestration.js`, `packages/api/routes/payments.js` |

---

## Payment Layer Phase 2

| Requirement | Implementation | Location |
|-------------|----------------|----------|
| **Currency conversion** | convertUSDToLocal, convertCurrency; CurrencyRate schema; updateDailyFXRates (OpenExchangeRates, CurrencyLayer, Fixer); roundLocalizedPrices | `packages/economy/currencyService.js`, `packages/database/schemas/CurrencyRate.js` |
| **Tax service** | calculateTax, calculateVAT, calculateGST; Avalara/TaxJar/Stripe Tax with region fallback; generateInvoice, storeTaxRecord; TaxRecord schema | `packages/api/services/taxService.js`, `packages/database/schemas/TaxRecord.js` |
| **Creator balance tracking** | CreatorWallet schema (balance, pendingBalance, withdrawableBalance); creditCreator, getCreatorWallet, recordPayout; economy.credit syncs for approved creators | `packages/database/schemas/CreatorWallet.js`, `packages/economy/creatorWallet.js` |

---

## Payment Layer Phase 3

| Requirement | Implementation | Location |
|-------------|----------------|----------|
| **KYC verification** | createVerificationSession, getKycStatus, markTaxFormSubmitted, isKycApproved; CreatorKyc schema; Onfido/Persona/Stripe Identity; gates payout request and execution | `packages/api/services/kycService.js`, `packages/database/schemas/CreatorKyc.js`, POST /payments/kyc/* |
| **Payout requests** | requestCreatorPayout (KYC gate, balance check, no pending); PayoutRequest schema; POST /payments/payouts/request, POST /payments/payouts/withdraw | `packages/api/services/paymentOrchestration.js`, `packages/database/schemas/PayoutRequest.js` |
| **Automated payouts** | runAutomatedPayoutCycle (KYC re-check, auto-approve); processPayouts (pending → processing); POST /payments/payouts/run-automated-cycle; cron `npm run payouts:process` | `packages/api/services/paymentOrchestration.js`, `scripts/process-payouts.js` |

---

## Payment Layer Phase 4

| Requirement | Implementation | Location |
|-------------|----------------|----------|
| **Fraud monitoring** | evaluateAndLogPayment (riskScore, action, signals); checkPpvVelocity; FraudEvent, Chargeback, DeviceFingerprint schemas; Sift/Riskified; Stripe Radar metadata; blocks high-risk payments | `packages/api/services/fraudService.js`, `packages/database/schemas/FraudEvent.js`, `Chargeback.js` |
| **Global payment routing** | getPaymentMethodsForRegion, getCheckoutCurrency, isCoinOnlyRegion; BR→PIX, EU→SEPA/iDEAL, MX→OXXO; high-risk regions coin-only; Region.local_payment_methods | `packages/api/services/paymentRouter.js`, checkout-preview, shop checkout |
| **Revenue reporting** | getCreatorRevenueCents, getCreatorRevenue; LedgerEntry/FinancialAuditLog aggregation; revenueData, totalRevenueCents; GET /monetization/revenue; CreatorDashboardPage revenue chart; PpvAnalytics, PlatformMetric | `packages/api/services/analyticsService.js`, `packages/monetization/analytics.service.js`, `packages/api/routes/content.js`, `monetization.controller.js` |

---

## Flow Overview

```
viewer payment (Stripe/PayPal/coins)
    → platform wallet (Wallet.balanceCents)
    → creator balance (Wallet + CreatorWallet)
    → payout processor (Stripe Connect / PayPal / Wise)
```

---

## Orchestration Requirements

| Requirement | Implementation |
|-------------|----------------|
| **Tax compliance** | TaxRecord storage, taxService (VAT/GST) at checkout; 1099/W-9 for creators |
| **Currency conversion** | CurrencyRate, currencyService.convertUSDToLocal(); FX at payout for non-USD |
| **Fraud control** | fraudService.evaluateAndLogPayment(), checkPpvVelocity(); block high-risk |
| **Automated payouts** | Scheduled job: auto-approve KYC-approved creators above threshold |
| **Audit logging** | FinancialAuditLog (all money moves), AdminAuditLog (admin overrides) |
| **KYC/AML enforcement** | kycService.isKycApproved() gates payout request & execution |

---

## Components

### 1. Viewer Payment Ingestion

- **Coin purchase** — Stripe checkout → economy.credit() → Wallet
- **Subscription** — Stripe subscription → Wallet debit → creator credit
- **PPV unlock** — Wallet debit → creator credit (content.js, ppv.unlock.service)
- **Gift** — Wallet debit → creator credit (content.js)
- **Shop checkout** — Stripe → Order → revenue split

### 2. Platform Wallet

- **Wallet** — balanceCents per user; LedgerEntry append-only
- **Ledger** — appendEntry(), getLedgerBalance(), verifyLedgerIntegrity()

### 3. Creator Balance

- **CreatorWallet** — balance, pendingBalance, withdrawableBalance, HOLD_DAYS
- **creditCreator()** — called after PPV, subscription, gift, shop revenue

### 4. Payout Processor

- **PayoutRequest** — pending → approved → paid (or rejected)
- **Providers:** stripe, paypal, stripe_connect, wise
- **executePayout()** — idempotent; FinancialAuditLog

---

## Orchestration Service API

**Location:** `packages/billing/src/orchestration.js`

| Function | Purpose |
|----------|---------|
| `recordViewerPayment(opts)` | Ingest viewer payment; fraud check; tax record; credit creator; audit |
| `requestCreatorPayout(opts)` | KYC gate; reserve funds; create PayoutRequest |
| `executePayoutWithChecks(payoutId)` | KYC re-check; execute; audit |
| `executePayoutBatchWithChecks(payoutIds)` | KYC re-check per payout; batch approve |
| `runAutomatedPayoutCycle()` | Auto-approve pending payouts for KYC-approved creators |

---

## KYC/AML Enforcement

- **Payout request:** Must pass `kycService.isKycApproved(creatorId)` before creating PayoutRequest
- **Payout execution:** Re-check KYC before approvePayout (defense in depth)
- **CreatorKyc:** status=approved, taxFormSubmitted=true

---

## Tax Compliance

- **Viewer side:** taxService.calculateVAT/GST at checkout; store TaxRecord
- **Creator side:** 1099/W-9 via kycService.taxFormSubmitted; tax invoice generation

---

## Currency Conversion

- **Display:** currencyService.convertUSDToLocal() for regional pricing
- **Payout:** payoutService.executePayout(currency) — Stripe Connect/Wise support multi-currency

---

## Fraud Control

- **Payment ingestion:** fraudService.evaluateAndLogPayment(); block if action=block
- **PPV velocity:** fraudService.checkPpvVelocity()
- **Chargebacks:** Stripe webhook → Chargeback schema; AdminAuditLog

---

## Automated Payouts

- **Trigger:** `POST /payments/payouts/run-automated-cycle` (admin) — call via cron or scheduler
- **Criteria:** Pending PayoutRequests; KYC approved at execution time
- **Action:** Auto-approve pending payouts for KYC-approved creators; reject those no longer KYC-approved
- **Config:** `PAYOUT_AUTO_ENABLED=true`, `SYSTEM_ADMIN_ID=<admin-user-id>`, `PAYOUT_AUTO_THRESHOLD_CENTS` (for eligibility view)
- **Eligibility:** `GET /payments/payouts/eligible-automated` — creators with balance ≥ threshold, KYC approved, no pending

---

## Audit Trail

- **FinancialAuditLog:** stripe_charge, stripe_payout, paypal_payout, payout_paid, coin_credit, etc.
- **AdminAuditLog:** payout_approve, payout_reject, financial_ops, support_refund

---

## Validation

- All financial mutations log to FinancialAuditLog
- All admin overrides log to AdminAuditLog
- KYC gates payout request and execution
- Fraud blocks high-risk payments before wallet credit

---

## Security Requirements (Item 15)

The payment layer enforces:

| Requirement | Implementation | Location |
|-------------|----------------|----------|
| **3D Secure payments** | `request_three_d_secure: 'any'` for payments ≥ $50 | `billing/stripe.js` (PaymentIntent), `payments.js` (shop checkout, buy-now) |
| **KYC verification before payout** | `kycService.isKycApproved()` gates payout request and execution | `paymentOrchestration.requestCreatorPayout`, `executePayoutWithChecks`, `runAutomatedPayoutCycle` |
| **Payouts disabled if KYC not verified** | Returns `403 KYC_REQUIRED`; automated cycle rejects non-KYC creators | `payments.js` payouts/request, payouts/withdraw |
| **Fraud scoring** | `fraudService.evaluateAndLogPayment()` → `{ riskScore, action, signals }`; blocks if `action === 'block'` | `fraudService.js`; used on coin_purchases, buy-now, shop_checkout |
| **Chargeback monitoring** | Stripe webhook `charge.dispute.*` → Chargeback schema + AdminAuditLog | `payments.js` webhooks/stripe |
| **Audit logging** | FinancialAuditLog (all money moves), AdminAuditLog (admin overrides) | economy/coins, paymentOrchestration, dashboards |
| **Rate limiting** | PAYMENT_RATE_LIMIT (20 req/15 min), PAYOUT_RATE_LIMIT (3 req/1 hr) | `payments.js` per-route config |
