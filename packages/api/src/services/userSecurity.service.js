'use strict';
/**
 * Per-user login lockout and failed-attempt counter (UserSecurity).
 * https://milloapp.com
 */
const db = require('@millo/database');

const LOCK_AFTER_ATTEMPTS = Number(process.env.LOGIN_LOCK_FAILED_ATTEMPTS) || 5;
const LOCK_MS = Number(process.env.LOGIN_LOCK_DURATION_MS) || 10 * 60 * 1000;

/**
 * Increment failed password attempts; lock account when threshold exceeded.
 * @param {string|import('mongoose').Types.ObjectId} userId
 */
async function incrementFailed(userId) {
  if (userId == null) return;
  const uid = userId.toString?.() || userId;
  const sec = await db.UserSecurity.findOneAndUpdate(
    { userId: uid },
    { $inc: { failedAttempts: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  if (sec.failedAttempts > LOCK_AFTER_ATTEMPTS) {
    sec.lockedUntil = new Date(Date.now() + LOCK_MS);
    await sec.save();
  }
}

/**
 * @param {string|import('mongoose').Types.ObjectId} userId
 */
async function ensureUserSecurity(userId) {
  const uid = userId.toString?.() || userId;
  let sec = await db.UserSecurity.findOne({ userId: uid });
  if (!sec) sec = await db.UserSecurity.create({ userId: uid });
  return sec;
}

/**
 * After successful password login: rotate known device / geo lists and clear failures.
 * @param {import('mongoose').Document} sec - UserSecurity mongoose doc
 */
async function applySuccessfulLoginProfile(sec, { deviceId, ip, country }) {
  const id = deviceId ? String(deviceId).trim().slice(0, 256) : '';
  if (id) {
    sec.knownDevices = [...new Set([...(sec.knownDevices || []), id])].slice(-10);
  }
  if (ip) {
    const ips = String(ip).slice(0, 64);
    sec.lastIps = [...new Set([...(sec.lastIps || []), ips])].slice(-10);
  }
  if (country && country !== 'UNKNOWN') {
    sec.lastCountries = [...new Set([...(sec.lastCountries || []), country])].slice(-10);
  }
  sec.failedAttempts = 0;
  await sec.save();
}

module.exports = {
  incrementFailed,
  ensureUserSecurity,
  applySuccessfulLoginProfile,
  LOCK_AFTER_ATTEMPTS,
  LOCK_MS,
};
