# DMCA operations runbook

**Product:** Millo — https://milloapp.com

This document is for **staff and engineering** handling DMCA notices. It is **not legal advice**. Counsel sets final process and templates.

## Sources of notices

- Public form: `POST /legal/dmca/takedown-notice` (also aliased as `POST /legal/dmca-report`).
- Email to the **designated agent** (see `/legal/copyright.html`).
- Admin tools: notice queues and actions under `/legal/dmca/notices/*` (authenticated staff APIs — see `packages/web/src/sdk/legalApi.js` and `dmcaService`).

## Intake checklist

1. Confirm the submission includes **target type** and **target ID** (or URL) sufficient to locate content.
2. Log receipt time; avoid editing user-visible content until policy-compliant steps are taken.
3. If required fields are missing, request a compliant notice rather than guessing targets.

## Takedown handling (high level)

1. **Validate** notice against policy and statutory elements (counsel-reviewed checklist).
2. **Disable or remove** access to allegedly infringing material when appropriate.
3. **Notify** the uploader when required (see counsel guidance on timing and content).
4. **Record** actions in admin audit / compliance systems where implemented.

## Counter-notice handling (high level)

1. Verify the counter-notice is complete and from the affected uploader (or authorized representative).
2. Follow **512(g)** timing and restoration rules as directed by counsel.
3. If the original complainant files a court order, comply with the order and update records.

## Repeat infringers

Track strikes per internal policy; escalate termination decisions per legal review.

## References

- Public policy HTML: `/legal/copyright.html`
- Deployment and infra: `docs/dmca-production.md`
- Agent config: `dmcaService.getDmcaAgent()` and environment variables used by that service
