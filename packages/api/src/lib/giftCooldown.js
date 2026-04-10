'use strict';
/**
 * Gift cooldown — prevent spam gifting. 2s minimum between gifts per user.
 * https://milloapp.com
 */
const COOLDOWN_MS = 2000;
const PRUNE_AFTER_MS = 5 * 60 * 1000; // prune entries older than 5 min
const lastGiftByUser = new Map();

function check(userId) {
  const uid = userId?.toString?.() || userId;
  if (!uid) return { allowed: true };
  const last = lastGiftByUser.get(uid);
  if (!last) return { allowed: true };
  const elapsed = Date.now() - last;
  if (elapsed < COOLDOWN_MS) {
    return { allowed: false, retryAfterMs: COOLDOWN_MS - elapsed };
  }
  return { allowed: true };
}

function record(userId) {
  const uid = userId?.toString?.() || userId;
  if (uid) lastGiftByUser.set(uid, Date.now());
}

function prune() {
  const now = Date.now();
  for (const [uid, ts] of lastGiftByUser.entries()) {
    if (now - ts > PRUNE_AFTER_MS) lastGiftByUser.delete(uid);
  }
}
if (typeof setInterval !== 'undefined') {
  setInterval(prune, 60 * 1000);
}

module.exports = { check, record, COOLDOWN_MS };
