# TODO — NOTIFICATIONS

## Scope
Email and push readiness visibility.

## Repo paths
- `packages/api`
- `packages/web`
- `docs`

## Current state
- Email may fall back to console without SendGrid/SMTP.
- Push depends on FCM/APNs and device token wiring.

## Immediate tasks
- [ ] Identify email provider selection logic in `packages/api`
- [ ] Expose email delivery mode:
  - [ ] `sendgrid`
  - [ ] `smtp`
  - [ ] `console`
- [ ] Audit push prerequisites:
  - [ ] provider config
  - [ ] device tokens
  - [ ] app wiring assumptions
- [ ] Add a small ops/admin readiness summary in docs or web diagnostics

## Smallest production-grade next step
Expose actual email/push readiness state instead of implying all notification channels are live.

## Definition of done
- [ ] Email delivery mode is diagnosable
- [ ] Push readiness is explicitly reported
- [ ] No UI implies working push without provider/tokens
