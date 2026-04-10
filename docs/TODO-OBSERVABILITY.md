# TODO — OBSERVABILITY

## Current reality

- worker/queue dashboards are thin
- provider visibility exists only partially
- ELK/Loki is not bundled in repo by design

## Next hardening tasks

- [ ] improve worker summaries
- [ ] improve queue summaries
- [ ] improve provider state visibility
- [ ] keep on-call docs aligned with current ops visibility

## Do not overbuild

- do not treat ELK/Loki bundling as a prerequisite for basic launch readiness
