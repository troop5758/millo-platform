# Phase 9 — Adult Content Compliance (Optional)

**Owns:** Age verification, content tagging, regional restrictions, payment processor compliance.  
**Depends on:** Phase 2 (schemas), Phase 11 (age gating), compliance module.

If the platform allows adult content, this phase implements the required safeguards.

---

## Age Verification

Required before access to mature/explicit content:

- **DOB verification** — Uses `Profile.dateOfBirth`; verified via age gate confirmation.
- **ID verification** — Optional; uses existing CreatorKyc (Stripe Identity, Onfido) or a dedicated age-verification flow.
- **Age gate modal** — Frontend presents modal; backend `GET /compliance/age-gate` returns whether user must confirm.

## Content Categories

All content must be tagged:

| Category  | Description                    |
|-----------|--------------------------------|
| `safe`    | General audience               |
| `mature`  | 18+ recommended                |
| `explicit`| Adult content, 18+ required    |

- **LiveStream** — `contentCategory` enum: safe, mature, explicit. Default: safe.
- **Product** — `contentCategory` enum: safe, mature, explicit. Default: safe.

## Regional Restrictions

- **Region.adult_content_allowed** — If false, mature/explicit content is hidden in that region.
- **Region.age_verification_required** — If true, ID or DOB verification required before mature/explicit access.

## Payment Processor Compliance

- For explicit content, some processors require creator KYC and age verification.
- Flag `requiresAdultVerification` on content; enforce before purchase/access.

## Schemas

- **Profile** — `ageVerifiedAt` (Date), `idVerifiedAt` (Date) — when user passed verification.
- **LiveStream** — `contentCategory`: safe | mature | explicit.
- **Product** — `contentCategory`: safe | mature | explicit.

## API

- `GET /compliance/age-gate` — Returns `{ required, reason?, minimumAge, ageVerified, idVerified }` for current user/region. Frontend uses this to show age gate modal.
- `POST /compliance/age-verify` — Confirm DOB (user attests); sets `Profile.ageVerifiedAt` when age check passes.
- Content endpoints (`/content/streams`, `/content/feed/*`) filter by `contentCategory` + region + user verification.
- PPV unlock (`POST /content/ppv/unlock`) enforces `canAccessContent` for mature/explicit streams before purchase.

## Domain

All behaviour bound to https://milloapp.com.
