'use strict';
/**
 * Reaction cooldown — prevent emoji spam. 300ms minimum between reactions per user.
 * https://milloapp.com
 */
const COOLDOWN_MS = 300;
const PRUNE_AFTER_MS = 2 * 60 * 1000; // prune entries older than 2 min
const lastReactionByUser = new Map();

function check(userId) {
  const uid = userId?.toString?.() || userId;
  if (!uid) return { allowed: true };
  const last = lastReactionByUser.get(uid);
  if (!last) return { allowed: true };
  const elapsed = Date.now() - last;
  if (elapsed < COOLDOWN_MS) {
    return { allowed: false, retryAfterMs: COOLDOWN_MS - elapsed };
  }
  return { allowed: true };
}

function record(userId) {
  const uid = userId?.toString?.() || userId;
  if (uid) lastReactionByUser.set(uid, Date.now());
}

function prune() {
  const now = Date.now();
  for (const [uid, ts] of lastReactionByUser.entries()) {
    if (now - ts > PRUNE_AFTER_MS) lastReactionByUser.delete(uid);
  }
}
if (typeof setInterval !== 'undefined') {
  setInterval(prune, 60 * 1000);
}

module.exports = { check, record, COOLDOWN_MS };
