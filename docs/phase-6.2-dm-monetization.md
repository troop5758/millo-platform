# Phase 6.2 — DM Monetization (Complete)

## Per-minute billing

- **Config:** `DM_CENTS_PER_MINUTE` (default 10), `DM_FREE_BUFFER_MINUTES` (default 5).
- **Logic:** `computeCharge(totalMinutes, freeBufferMinutes)` → `billableMinutes = max(0, floor(totalMinutes) - floor(freeBuffer))`, `amountCents = billableMinutes * centsPerMinute`.
- **Location:** `packages/dm-monetization/src/billing.js`.

## Free buffer

- First N minutes (default 5) are free; only minutes beyond that are billed.
- **Location:** `packages/dm-monetization/src/billing.js` — `getFreeBufferMinutes()`, used in `computeCharge` and in session end.

## Offline queue

- **API:** `enqueue(type, payload)` — append to DMOfflineEvent (processedAt = null). `getPendingEvents()`, `processQueue()` / `syncOfflineQueue()` — process each pending event (e.g. `session_end` → endSession, `session_approve` → approveSession), then set processedAt.
- **Location:** `packages/dm-monetization/src/offlineQueue.js`.

## Creator approval

- **API:** `creatorApproval(sessionId, creatorId, approved)` — when approved, calls `approveSession(sessionId, creatorId)`. Charge is applied only after approval.
- **Sessions:** `startSession(creatorId, userId)`, `endSession(sessionId)` (computes minutes + amount), `approveSession(sessionId, creatorId)` (debit user, credit creator via economy).
- **Location:** `packages/dm-monetization/src/sessions.js`, `src/approval.js`.

## Schemas (Phase 6.2, documented)

- **DMSession:** creatorId, userId, startedAt, endedAt, totalMinutes, freeBufferMinutes, billableMinutes, approved, charged, amountCents.
- **DMOfflineEvent:** type, payload, processedAt.

## Validation

- **Billing accuracy tested:** Unit tests in `packages/dm-monetization/src/billing.test.js` — zero minutes, within buffer, 10 min / 5 free = 5 billable = 50 cents, etc.
- **Offline queue sync works:** Enqueue `session_end`, call `syncOfflineQueue()`, assert event processed and processedAt set; pending count 0 after sync. Tests in `packages/dm-monetization/src/offlineQueue.test.js` (requires MongoDB).

Run: `node --test packages/dm-monetization/src/billing.test.js` (no DB).  
Run: `node --test packages/dm-monetization/src/offlineQueue.test.js` (requires MongoDB).  
Run: `npm run validate:phase6.2` to run both (billing only if DB unavailable).

---

*Phase 6.2 complete. Proceed to next phase in specified order.*
