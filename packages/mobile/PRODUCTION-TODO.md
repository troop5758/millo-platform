# MOBILE PRODUCTION TODO

Mobile-specific implementation tasks only. Does not assert CI/tests are green.

## Current position

Mobile launch scope must be decided explicitly.  
If mobile is **not** part of the initial public launch, the items below should be treated as **deferred** and should not be implied as shipped.

## If mobile is in launch scope

### Must-have

- [ ] verify which auth flows are actually supported in production
- [ ] verify which notification flows are actually supported in production
- [ ] verify live feature support that is promised in mobile UX
- [ ] remove or hide stubbed live filters if not actually supported
- [ ] remove or hide Milla / AI areas that remain partial or missing
- [ ] ensure locale parity for shipped strings
- [ ] ensure production auth does not rely on DEV-only shortcuts

### Should-have

- [ ] improve provider-state visibility where mobile UX depends on it
- [ ] align support/order-related flows with the chosen backend model story

## If mobile is out of scope for initial launch

### Deferred

- [ ] live filters completion
- [ ] Milla / AI completion
- [ ] broader mobile parity work

### Requirement

- [ ] do not market deferred mobile capabilities as currently shipped
