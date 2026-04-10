# Phase 17 — Self-Observation

**Owns:** Health monitor, Drift detection, Upgrade advisor, Security alert system.

**Depends on:** All previous phases.

---

## Scope

- **Health monitor** — Health status (node, uptime, optional MongoDB); read-only.
- **Drift detection** — Compare current state (Node version, config, manifest) to expected; return recommendations.
- **Upgrade advisor** — Recommend Node and dependency practices; no install or upgrade executed.
- **Security alerts** — Security-related recommendations (engines.node, NODE_ENV); read-only.
- **Validation:** Recommendations visible; no auto-changes.

---

## Behaviour

- **Read-only** — No code path runs `npm install`, `npm ci`, `writeFileSync`, or any change to config or infrastructure.
- **Recommendations visible** — All outputs are recommendation or status objects; exposed via API and module API.

---

## Package: @millo/self-observation

| Export | Description |
|--------|-------------|
| `detectDrift(options)` | Returns `{ recommendations, autoChange: false }`. Checks Node major, MILLO_APP_URL, package.json engines. |
| `getUpgradeRecommendations(options)` | Returns `{ recommendations, autoChange: false }`. Engine and floating dependency suggestions. |
| `getHealthStatus(options)` | Returns `{ status, checks, autoChange: false }`. Node, uptime; optional MongoDB when `checkMongo: true`. |
| `getHealthSummary()` | Returns `{ status, node, uptimeSeconds, autoChange: false }`. |
| `getSecurityAlerts(options)` | Returns `{ alerts, autoChange: false }`. Manifest and NODE_ENV suggestions. |
| `getRecommendations(options)` | Aggregates drift, upgrade, health, security into `{ recommendations, health, drift, upgrade, security, autoChange: false }`. |

Every recommendation/alert includes `autoChange: false`.

---

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | /observation/recommendations | Aggregated recommendations and health |
| GET | /observation/drift | Drift detection result |
| GET | /observation/upgrade | Upgrade advisor result |
| GET | /observation/health | Health summary |
| GET | /observation/security | Security alerts |

All read-only; no request body or side effects.

---

## Validation

- **Recommendations visible** — Unit tests assert that `getRecommendations`, `detectDrift`, `getUpgradeRecommendations`, `getSecurityAlerts`, `getHealthSummary` return structures with `recommendations`/`alerts`/`status` and `autoChange: false`.
- **No auto-changes** — Script greps package source for forbidden patterns: `execSync('npm`, `writeFileSync`, `fs.write`, `npm install`, etc. No matches allowed.

Run: `npm run validate:phase17`.

---

## Domain

All behaviour bound to https://milloapp.com.
