# Phase 2 — Database Schemas (Authoritative)

**Owns:** ALL MongoDB schemas, Ledger schema, index definitions, field documentation.  
**Must NOT include:** Controllers, services, business logic.  
**Depends on:** Phase 1.

---

## MongoDB — 24+ schemas (Users → AuditLogs)

| # | Schema | Collection | Indexes |
|---|--------|------------|--------|
| 1 | User | users | email (unique), externalId, role, createdAt |
| 2 | Session | sessions | userId, tokenHash (unique), expiresAt |
| 3 | Profile | profiles | userId (unique), displayName |
| 4 | Wallet | wallets | userId (unique), currency |
| 5 | Transaction | transactions | walletId+createdAt, type, refId |
| 6 | LedgerEntry | ledgerentries | sequence (unique), type+createdAt, actorId+createdAt |
| 7 | Battle | battles | status, startedAt, winnerId |
| 8 | BattleParticipant | battleparticipants | battleId+userId (unique), userId+createdAt |
| 9 | LiveStream | livestreams | userId+createdAt, status, startedAt |
| 10 | LiveViewer | liveviewers | streamId+userId, streamId+joinedAt |
| 11 | Level | levels | userId (unique), level |
| 12 | TrustScore | trustscores | userId+createdAt, score |
| 13 | Ad | ads | campaignId, placement+status |
| 14 | AdImpression | adimpressions | adId+at, userId+at |
| 15 | Campaign | campaigns | status, startsAt+endsAt |
| 16 | Dashboard | dashboards | userId+createdAt |
| 17 | DashboardWidget | dashboardwidgets | dashboardId+order |
| 18 | TVChannel | tvchannels | slug (unique), status |
| 19 | TVSchedule | tvschedules | channelId+startsAt, startsAt+endsAt |
| 20 | Notification | notifications | userId+createdAt, userId+read |
| 21 | AuditLog | auditlogs | action+createdAt, actorId+createdAt, resourceType+resourceId |
| 22 | FinancialAuditLog | financialauditlogs | action+createdAt, walletId+createdAt |
| 23 | AdminAuditLog | adminauditlogs | action+createdAt, adminId+createdAt |
| 24 | Report | reports | targetType+targetId, status+createdAt |
| 25 | ModerationLog | moderationlogs | moderatorId+createdAt, targetType+targetId |
| 26 | Invite | invites | code (unique), inviterId+createdAt, expiresAt |
| 27 | Subscription | subscriptions | userId, status+endsAt |
| 28 | TrustEdge | trustedges | from+to+edgeType (unique), from+updatedAt |
| — | UserProfileFeatures | userprofilefeatures | userId (unique), createdAt, updatedAt, locale/country/language defaults |
| — | ContentFeatures | contentfeatures | contentId (unique), creatorId (required), type default short, moderation enum, compound indexes on createdAt |
| — | FeedEvent | feedevents | userId+ts, contentId+ts, eventType+ts; topic/contentType/meta; timestamps |

**TrustEdge:** directed edges for admin trust/risk graph (`from` → `to`); `edgeType`: device_link, gift, follow, co_fingerprint, payment_cluster, engagement, other.

**UserProfileFeatures / ContentFeatures / FeedEvent:** discovery recommendation pipeline — user aggregates, per-content features, append-only feed events. See [discovery-recommendation-pipeline.md](./discovery-recommendation-pipeline.md).

**Total: 28+ schemas.** All in `packages/database/src/schemas/`. Indexes compile via `syncIndexes()`.

## Immutable Ledger (SQL optional)

- **MongoDB:** `LedgerEntry` schema — append-only; use for immutable ledger in Mongo.
- **PostgreSQL (optional):** `packages/database/sql/ledger_optional.sql` — optional table definition for SQL-backed ledger.

## Validation

- **Indexes compile:** Run `node scripts/validate-schemas.js` (requires MongoDB running). Calls `syncIndexes()` on all models.
- **No controllers:** `packages/database` has no `controllers/` directory; schemas only.

---

*Phase 2 complete. No controllers exist. Proceed to next phase in specified order.*
