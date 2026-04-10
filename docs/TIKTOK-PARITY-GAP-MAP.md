> **Note:** This document does not claim current parity with TikTok. It is a planning artifact.

# TikTok parity — gap map

Rough mapping from **TikTok-class expectation** → **Millo current state** → **severity** → **suggested phase**. Severities are **product/risk relative to a broad consumer promise**, not a judgment of engineering effort alone.

| Workstream | TikTok-class expectation | Millo current state | Gap severity | Recommended phase |
|------------|-------------------------|---------------------|--------------|-------------------|
| Feed & discovery | Stable infinite FYP, deep personalization, strong sound/search surfaces | Best-effort/capped paging; incomplete hydration; not “TikTok-stable” per platform gaps | **Critical** (if you promise TikTok-like feed) | P0 honesty + scope; P2+ depth |
| Creation & editor | Capture, effects, editing, drafts, reliable upload/transcode, creator analytics | Incremental; verify per surface—assume behind TikTok unless proven | **Major** | P1–P2 by launch bar |
| Live | Multi-layout LIVE, co-host, gifts, shopping LIVE, LIVE discovery, scale | Metadata APIs exist; filters stub; co-host/device analytics partial; scale unproven at TikTok volume | **Major** | P0–P1 for “basic live”; P2+ for depth |
| Trust, safety & compliance | Clear live enforcement, moderation queues, appeals, regional compliance | KYC/AI/Cloudflare env-gated or stub; UI not always explicit | **Critical** (for public launch at scale) | P0 declare + surface modes; P1 expand |
| Social graph & messaging | DMs, comments, graph, spam controls | Variable—must be explicitly in/out for launch | **Moderate**–**Major** | P0 define scope; P1+ if in scope |
| Commerce & money | Global payments, shop, disputes, seller ops | Env-gated processors; partial locks; no universal payment index; PaymentReference partial | **Critical** (if commerce promised) | P0 blockers per production checklist |
| Notifications & growth | Reliable email/push, growth tooling | Partial/env-gated; console email not production for customers | **Major** | P0 for promised channels |
| Client apps & UX polish | Native-first polish, performance, i18n, accessibility | Uneven web/mobile; stub areas; i18n parity gaps | **Major** | P0 for chosen launch client |
| Platform, data & ML ops | Feature stores, experiments, rich observability | Thin queue/worker story; no in-repo ELK/Loki required for narrow launch | **Moderate**–**Major** | P0 minimum triage; P3 maturity |
| Org & process | 24/7 moderation, legal, partnerships | Not represented as complete in repo | **Critical** at scale | P0 minimum ownership; ongoing |

### How to use this table

- **Critical** here means: **unsafe or misleading** if you claim parity or launch too broad without closing gaps.
- **P0** = narrow launch readiness and honesty (see `docs/TIKTOK-PARITY-PHASES.md`).
- Phases are **not** “one milestone to parity.”
