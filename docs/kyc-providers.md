# KYC / Identity Verification

Creator identity verification is required before payouts. The platform supports **Sumsub**, **Onfido**, **Stripe Identity**, and **Persona**. When no provider is configured, **stub mode** is active (verification disabled).

## Stub Mode

- **When**: `KYC_PROVIDER` is unset, `none`, or the selected provider has no credentials.
- **Behaviour**:
  - `POST /payments/kyc/start` returns `{ provider: 'fallback', stub: true, verificationId: 'kyc_stub_...', message: '...' }`.
  - No real verification flow; identity verification is effectively disabled.
- **Payouts in stub mode**: Set **Stub Mode: Allow Payout Without KYC** in Admin → System Configuration → KYC to allow creators to receive payouts without completing KYC (dev only). In production, leave this off.

Configure the provider and credentials in **Admin Dashboard → System Configuration → KYC**.

## Recommended Providers

| Provider        | Use case              | Notes                    |
|----------------|------------------------|--------------------------|
| **Sumsub**     | Full KYC, global       | SDK or REST; webhook required |
| **Onfido**     | Document + selfie      | EU/US regions            |
| **Stripe Identity** | Already using Stripe | Same Stripe account      |
| **Persona**    | Flexible flows         | Template-based            |

## Sumsub

### Install (optional SDK)

```bash
npm install sumsub-node-sdk
```

If the SDK is not installed, the service uses the REST API (fetch + HMAC). No extra dependency required.

### Configuration

Set in Admin → System Configuration → KYC, or via env:

| Setting | Env var | Description |
|--------|---------|-------------|
| Provider | `KYC_PROVIDER` | `sumsub` |
| App Token | `SUMSUB_APP_TOKEN` | Sumsub app token |
| Secret Key | `SUMSUB_SECRET_KEY` | Sumsub secret key |
| Base URL | `SUMSUB_BASE_URL` | Default `https://api.sumsub.com` |
| Level Name | `SUMSUB_LEVEL_NAME` | e.g. `basic-kyc-level` |
| Webhook Secret | `SUMSUB_WEBHOOK_SECRET` | For webhook signature verification |

### Service usage (backend)

```javascript
const sumsub = require('./services/kyc/sumsub');

// Create applicant
const { applicantId } = await sumsub.createApplicant(userId, {
  email: 'user@example.com',
  firstName: 'Jane',
  lastName: 'Doe',
});

// Get SDK token for frontend Web SDK
const { token, url } = await sumsub.getAccessToken(userId, { ttlInSecs: 900 });
```

### Webhook

- **URL**: `POST /payments/kyc/webhook/sumsub` or `POST /webhooks/kyc/sumsub`
- **Signature**: `X-Payload-Digest` = HMAC-SHA256(webhook secret, raw body)
- **Payload**: Sumsub applicant/review payload. `reviewResult.reviewAnswer` or `reviewStatus` is mapped to KYC status (approved/rejected/in_review).

## Onfido

- **Env**: `ONFIDO_API_TOKEN`, `ONFIDO_REGION` (eu|us)
- **Webhook**: `POST /webhooks/kyc/onfido`
- **Config**: Admin → System Configuration → KYC (Onfido API Token, Region)

## Stripe Identity

- Uses existing Stripe credentials (`STRIPE_SECRET_KEY`). No separate KYC keys.
- Set `KYC_PROVIDER=stripe_identity`.
- Verification sessions: `stripe.identity.verificationSessions.create({ type: 'document', ... })`.
- Webhook: Stripe sends `identity.verification_session.verified` (or use existing Stripe webhook route).

## Persona

- **Env**: `PERSONA_API_KEY`, `PERSONA_TEMPLATE_ID`, `PERSONA_WEBHOOK_SECRET`
- **Webhook**: `POST /webhooks/kyc/persona`. Header `Persona-Signature` for verification.
- **Config**: Admin → System Configuration → KYC

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/payments/kyc/start` | Start verification (returns provider URL/token or stub) |
| GET | `/payments/kyc/status` | Current KYC status |
| POST | `/payments/kyc/tax-form` | Mark tax form submitted |
| POST | `/payments/kyc/webhook/:provider` | Provider webhook (`sumsub`, `persona`, `stripe_identity`, `onfido`) |

## Health / Observation

- **GET /admin/config/health**: Includes `kyc.configured`, `kyc.provider`, `kyc.stubMode`.
- **GET /observation/config**: Includes `services.kyc` (configured, provider, stubMode).
