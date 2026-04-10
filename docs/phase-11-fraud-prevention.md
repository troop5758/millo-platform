# Phase 11 — Fraud Prevention System

**Owns:** Fraud detection signals, device fingerprinting, payment anomaly checks, multi-account detection, Sift/Stripe Radar/Riskified integration.  
**Depends on:** Phase 2 (schemas), billing, payments.

Prevent scams and payment fraud.

---

## Fraud Detection Signals

| Signal | Description |
|--------|-------------|
| **IP mismatch** | Session created from IP A, payment from IP B |
| **Device fingerprint** | Track device IDs; flag new device + high-risk action |
| **Payment anomalies** | Unusual amount, velocity, first-time high-value |
| **Multiple accounts** | Same IP/device used by many accounts |

## Tools (Integration)

| Provider | Use |
|----------|-----|
| **Stripe Radar** | Built into Stripe; pass metadata to PaymentIntents/Checkout |
| **Sift** | Optional; `SIFT_BEACON_KEY` for client, `SIFT_API_KEY` for server |
| **Riskified** | Optional; `RISKIFIED_ACCOUNT_ID`, `RISKIFIED_AUTH_KEY` |

## Schemas

- **FraudEvent** — userId, eventType (payment|login|signup), action, riskScore, signals[], provider, meta, ip, userAgent, deviceFingerprint.
- **DeviceFingerprint** — fingerprint (hash), userId, firstSeenAt, lastSeenAt, ip, userAgent, accountCount.

## API

- `POST /fraud/track` — Record device fingerprint, IP; called by frontend after auth.
- Payment flows call `fraudService.evaluatePayment()` before creating PaymentIntent/Checkout; block or flag high-risk.

## Domain

All behaviour bound to https://milloapp.com.
