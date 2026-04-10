# TODO — AUTH

## Current reality

- OAuth remains env-gated
- provider-not-configured UX is not standardized everywhere on web

## Next hardening tasks

- [ ] standardize provider-not-configured handling in API
- [ ] standardize provider-not-configured UX in web auth flows
- [ ] remove ambiguous degraded auth paths from launch-critical UX

## Do not overclaim

- do not treat DEV auth shortcuts as production authorization
