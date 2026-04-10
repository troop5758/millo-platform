# On-call rotation

Defines **who** carries the pager and **what** they own. Pair with **`docs/RUNBOOK-ONCALL-MINIMUM.md`**, **`docs/infra-monitoring.md`** (alerts), and **`docs/INCIDENT-POSTMORTEM-TEMPLATE.md`**.  
https://milloapp.com

---

## Structure

| Role | Purpose |
|------|---------|
| **Primary** | Receives **PagerDuty / phone** (or equivalent) for **`priority=P0`** routes first; **owns** the incident until handed off or resolved. |
| **Secondary** | **Backup** if primary is unreachable within SLA (e.g. 5–15 min); covers overlap during **primary transition** (handoff day). |

Optional: **shadow** (learns, no pager) for onboarding—your org policy.

---

## Schedule

- **Weekly rotation** (common default): handoff at a fixed **day/time + timezone** (e.g. Monday 09:00 UTC).
- Publish the roster in **one source of truth** (PagerDuty schedule, shared calendar, or internal wiki)—avoid drift between tools.
- **Override** process: vacation and sick coverage documented (who approves swaps).

---

## Responsibilities

1. **Respond to alerts** — Acknowledge within **tier targets** (P0 immediate, P1 ~15 min, P2 ~1 h—see `docs/infra-monitoring.md`).
2. **Lead incident response** — Drive **`docs/RUNBOOK-ONCALL-MINIMUM.md` § 7** (detect → triage → contain → mitigate → communicate → resolve).
3. **Write or delegate the postmortem** — For **material** incidents, ensure **`docs/INCIDENT-POSTMORTEM-TEMPLATE.md`** is completed with owners and dates (primary may **delegate** drafting but remains accountable for closure).

**Not** solely on-call: long-term code fixes may go to teams—but the on-call **files** the incident and **ensures** follow-up tickets exist.

---

## Handoff (weekly)

- Open incidents / silenced alerts with **owner** and **expiry**.
- **Noisy** alert trends noted for SRE follow-up.
- Quick **verbal or written** sync: known deploys, provider incidents, fragile systems.
