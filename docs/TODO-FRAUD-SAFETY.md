# TODO — FRAUD & SAFETY

## Scope

Provider-state visibility and stub/live distinction for safety systems.

## Repo paths

- `packages/api`
- `packages/web`
- `docs`

## Current state

- Cloudflare IP reputation is **placeholder** unless enabled
- AI moderation has a **provider-off stub** path
- KYC uses **stub IDs** when provider is off
- **`GET /health`** includes **`checks.provider_states`** (aiModeration, kyc, payments) — **web product surfaces** are not all explicit about stub vs live

## Immediate tasks

- [ ] Inventory provider-state flags for:
  - [ ] Cloudflare reputation
  - [ ] AI moderation
  - [ ] KYC
- [ ] Add or reuse mode vocabulary: `enabled` | `disabled` | `stub` | `unconfigured`
- [ ] Audit admin/ops and high-risk user flows for how provider state is shown
- [ ] Ensure docs do not imply live enforcement when providers are off

## Smallest production-grade next step

Make stub vs live **visible** on surfaces where users or admins could assume full enforcement.

## Definition of done

- [ ] Provider states are documented consistently
- [ ] Stub safety paths are clearly labeled in UI where it matters
- [ ] Non-production-only stub behavior is documented honestly
