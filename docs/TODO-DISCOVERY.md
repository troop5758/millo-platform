# TODO — DISCOVERY

## Current reality

- paging is best-effort / offset-based
- stable infinite feed behavior is not complete
- full hydration is not guaranteed
- subscription tier CRUD is still partial
- filter version pinning is not end-to-end

## Next hardening tasks

- [ ] keep paging semantics explicit
- [ ] keep UI honest about current feed depth
- [ ] improve row hydration and fallbacks
- [ ] identify missing CRUD operations precisely
- [ ] document filter version pinning status end-to-end

## Still missing

- stable infinite For You behavior
- guaranteed full feed hydration for every row
