# WEB PRODUCTION TODO

Web-specific implementation tasks only. Does not assert CI/tests are green.

## Launch blockers

### Money & commerce

- [ ] keep money surfaces explicit about stub vs live mode
- [ ] do not render production-looking success UX on provider-off flows
- [ ] keep seller verification / penalties / reassignment UX aligned to actual backend support

### Auth

- [ ] standardize provider-not-configured UX across web auth surfaces
- [ ] remove half-broken provider entry points from shipped UX

### Trust & safety

- [ ] do not imply live KYC/AI/Cloudflare enforcement if providers are off
- [ ] reflect actual provider mode in user/admin surfaces where relevant

### Notifications

- [ ] do not promise customer email/push flows that are not truly operational

### Support & orders

- [ ] align support/order-related UX with the chosen order-linked support model
- [ ] remove ambiguity caused by split model assumptions (Ticket vs SupportTicket)

## Must-have before public launch

### API/UI honesty

- [ ] consume provider mode/config state from JSON where available
- [ ] keep AI controls visibly read-only until persistence exists
- [ ] keep discovery honest about best-effort paging and incomplete hydration
- [ ] do not present payment reference lookup as a universal search layer (`PaymentReference` coverage only)

### Live

- [ ] keep metadata editing UX aligned with actual route ownership
- [ ] scope down or hide unsupported filters/co-host/device analytics capabilities for launch

### Admin / AI

- [ ] align shadow vs kill-switch wording with backend reality
- [ ] do not imply saved configuration where API behavior is read-only/non-persistent

## Should-have soon after launch

- [ ] improve discovery row fallbacks/hydration experience
- [ ] verify locale parity for shipped strings
- [ ] remove any launch dependence on DEV-only auth shortcuts

## Do not assume complete without verification

- [ ] build health
- [ ] test health
- [ ] shipped locale parity
- [ ] real role-based access behavior in production
