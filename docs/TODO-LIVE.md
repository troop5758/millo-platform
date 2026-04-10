# TODO — LIVE

## Current reality

### Implemented

- `PUT /streams/:id/metadata`
- `PATCH /live/stream/:streamId`

### Still partial

- filters SDK
- device analytics
- co-host coverage

## Next hardening tasks

- [ ] standardize validation across metadata paths
- [ ] standardize ownership/authorization checks
- [ ] document one clear PUT vs PATCH story
- [ ] keep unsupported live tools hidden or labeled honestly

## Do not overbuild

- do not create overlapping metadata endpoints instead of hardening the current ones
