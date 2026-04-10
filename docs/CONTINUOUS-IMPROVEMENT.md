# Continuous improvement (post-incident)

After **every material incident**, close the loop so the same class of failure is **harder to miss** and **faster to fix** next time. This extends **`docs/INCIDENT-POSTMORTEM-TEMPLATE.md`** action items.  
https://milloapp.com

---

## Minimum bar

| Action | Intent |
|--------|--------|
| **Add or tune an alert** | If detection was late or missing, extend **`infra/monitoring/alerts.yml`** (or upstream exporter rules) with a **tested** threshold—avoid permanent noise; use `priority` labels for paging. |
| **Improve dashboard** | If triage was slow, add a **Grafana** panel or row (System / Money / Live—see `docs/infra-monitoring.md`) so the next responder sees **signal in one place**. |
| **Fix root cause** | Track code, config, capacity, or process change in **tickets** with owners and dates—not only documentation. |

---

## When to skip none of the three

If the incident was **purely external** (e.g. provider outage) with no Millo gap, still record **what we learned** (runbook link, comms template). Optional: **synthetic check** or **dependency dashboard** if blind spot was real.

---

## Cadence beyond incidents

- **Quarterly** — Review top noisy alerts, dashboard usage, and SLO error-budget spend.
- **Post-launch** — Load-test and monitoring gaps (`docs/LOAD-TESTING.md`, `docs/DEPLOYMENT-SAFETY.md`).

---

## Related

- **`docs/RUNBOOK-ONCALL-MINIMUM.md` § 7** — incident response.
- **`docs/INCIDENT-POSTMORTEM-TEMPLATE.md`** — action item table.
