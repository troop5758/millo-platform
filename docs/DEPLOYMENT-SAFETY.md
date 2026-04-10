# Deployment safety

Change-management rules for production. Millo expects **reproducible, script-driven deploys** and production bound to **https://milloapp.com** (see workspace system rules). Adapt commands to your orchestrator (Kubernetes, PM2, systemd, etc.).  
https://milloapp.com

---

## Rules

| Rule | Rationale |
|------|-----------|
| **Never deploy on Friday** (default) | Reduces weekend risk when staffing is thin. **Exception:** approved **emergency** hotfix (security, money, outage) with exec + on-call sign-off—still use the same checks below. |
| **Always use staging** | Prod-like config and data **policy**; run smoke tests (auth, core read paths, payment **sandbox** if applicable) before promoting. |
| **Use canary deploy** | Shift a **small share** of traffic (or one replica / one region) to the new revision first; watch **SLOs**, **errors**, and **business metrics** before full rollout. |
| **Rollback must be one command away** | Know the **previous good** image/revision and test **`undo` / redeploy** in staging first. |

---

## Rollback (Kubernetes example)

```bash
# Revert API deployment to the previous ReplicaSet (adjust namespace/name)
kubectl rollout undo deployment/millo-api -n <namespace>

# Inspect history
kubectl rollout history deployment/millo-api -n <namespace>
```

For **non-Kubernetes** installs (e.g. PM2 on Ubuntu), use your **tagged release** + **install script** or **process manager** rollback documented in **`docs/DEPLOY-UBUNTU-22.04.md`** / **`docs/AUTOMATED-SERVER-INSTALL.md`**.

---

## Before every production deploy

- [ ] Change merged with review; **migrations** backward-compatible or two-step plan documented.
- [ ] **Staging** verified; **feature flags** / kill-switches understood (`GET /security/kill-switches`).
- [ ] **Observability** ready: Grafana dashboards, Sentry release, alerts not silenced without a ticket.
- [ ] **On-call** aware; **rollback** owner identified.

---

## After deploy

- Watch **error rate**, **latency**, **queue depth**, **payment** metrics (see `docs/infra-monitoring.md`).
- If SLO burn is unacceptable → **rollback first**, debug second (see `docs/RUNBOOK-ONCALL-MINIMUM.md` § 7).
