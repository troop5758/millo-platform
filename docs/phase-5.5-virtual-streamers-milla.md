# Phase 5.5 — Virtual Streamers (MILLA) (Complete)

## AI policy engine

- **Location:** `packages/milla/src/policyEngine.js`
- **Rules:** AI enabled for MILLA; **NEVER acts without policy approval.**
- **API:** `getPolicy()`, `setPolicy(p)`, `isApproved(action, context)`, `requireApproval(action, context)`. Policy keys: `giftReaction`, `voiceOut`, `voiceIn`. Before any MILLA action, call `requireApproval(action)`; if not approved, throws `POLICY_DENIED`.

## Voice hooks

- **Location:** `packages/milla/src/voiceHooks.js`
- **API:** `registerHook(direction, fn)` — direction `'in'` or `'out'`; `emitHook(direction, data)` — for `'out'` calls `requireApproval('voiceOut', data)` first. Stub hooks only; no TTS/STT implementation.

## Gift reactions

- **Location:** `packages/milla/src/giftReactions.js`
- **API:** `reactToGift(gift, streamId)` — calls `requireApproval('giftReaction')` first; if denied throws; if approved, logs reaction, runs content through moderation wrapper, then emits voice out. `getReactionLog()`, `clearReactionLog()`.

## Moderation wrapper

- **Location:** `packages/milla/src/moderationWrapper.js`
- **API:** `checkContent(content, streamId)` — returns Promise<boolean>; default allows all. `setModerationCheck(fn)` to inject real moderation (e.g. call live moderation or content filter). MILLA output (e.g. gift reaction message) is checked before emitting.

## Validation

- **Policy gating verified:** When policy denies `giftReaction`, `reactToGift` throws `POLICY_DENIED` and no reaction is logged. When policy allows, reaction is performed and logged. Unit tests in `packages/milla/src/policyEngine.test.js`.

Run: `node --test packages/milla/src/policyEngine.test.js` or `npm run test -w @millo/milla` from repo root.

---

*Phase 5.5 complete. Proceed to next phase in specified order.*
