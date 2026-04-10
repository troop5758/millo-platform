'use strict';
/**
 * Account Takeover Protection — impossible travel detection, risk lock, step-up verification.
 * Login from US then 2 min later from Russia → require verification. https://milloapp.com
 */
const db = require('@millo/database');
const geoService = require('./geoService');

const IMPOSSIBLE_TRAVEL_KM = Number(process.env.ATO_IMPOSSIBLE_TRAVEL_KM) || 5000;
const IMPOSSIBLE_TRAVEL_HOURS = Number(process.env.ATO_IMPOSSIBLE_TRAVEL_HOURS) || 1;

/**
 * Haversine distance in km between two lat/lon points.
 */
function distanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Detect impossible travel: last login and new login are > distanceKm apart and timeDiff < hours.
 * Returns true if impossible travel detected (trigger risk lock).
 */
async function detectImpossibleTravel(userId, newLogin) {
  if (!userId || !newLogin) return false;
  const uid = userId.toString?.() || userId;
  const last = await db.LoginAudit.findOne({ userId: uid, loginSuccess: true })
    .sort({ createdAt: -1 })
    .lean();
  if (!last || last.latitude == null || last.longitude == null) return false;
  if (newLogin.latitude == null || newLogin.longitude == null) return false;

  const dist = distanceKm(
    last.latitude,
    last.longitude,
    newLogin.latitude,
    newLogin.longitude
  );
  const timeDiffHours = (new Date(newLogin.createdAt || Date.now()) - new Date(last.createdAt)) / 3600000;

  if (dist > IMPOSSIBLE_TRAVEL_KM && timeDiffHours < IMPOSSIBLE_TRAVEL_HOURS) {
    return true;
  }
  return false;
}

/**
 * Record login to LoginAudit and run ATO check. If impossible travel, set user.riskLock and log FraudEvent.
 * Call after successful auth (email/password or OAuth). newLogin: { ip, country, city, latitude, longitude, deviceFingerprint, userAgent, createdAt? }.
 */
async function recordLoginAndCheckATO(userId, newLogin, opts = {}) {
  if (!userId) return { recorded: false, riskLockSet: false };
  const uid = userId.toString?.() || userId;
  const createdAt = newLogin.createdAt ? new Date(newLogin.createdAt) : new Date();

  await db.LoginAudit.create({
    userId: uid,
    ip: newLogin.ip || null,
    country: newLogin.country || null,
    city: newLogin.city || null,
    latitude: newLogin.latitude ?? null,
    longitude: newLogin.longitude ?? null,
    deviceFingerprint: newLogin.deviceFingerprint || null,
    userAgent: newLogin.userAgent || null,
    loginSuccess: true,
    createdAt,
  });

  const newLoginWithTime = { ...newLogin, createdAt };
  const impossibleTravel = await detectImpossibleTravel(uid, newLoginWithTime);
  let riskLockSet = false;

  if (impossibleTravel) {
    await db.User.updateOne({ _id: uid }, { $set: { riskLock: true } }).catch(() => {});
    riskLockSet = true;
    await db.FraudEvent.create({
      userId: uid,
      eventType: 'ato_impossible_travel',
      action: 'review',
      riskScore: 90,
      signals: ['impossible_travel'],
      provider: 'internal',
      ip: newLogin.ip,
      userAgent: newLogin.userAgent,
      refType: 'login_audit',
      meta: { ato: true, requireVerification: true },
    }).catch(() => {});
    if (opts.log) opts.log.warn?.({ userId: uid, ip: newLogin.ip }, 'ATO: impossible travel — risk lock set');
  }

  return { recorded: true, riskLockSet };
}

/**
 * Check if user has risk lock (verification required before sensitive actions).
 */
async function isRiskLocked(userId) {
  if (!userId) return false;
  const u = await db.User.findById(userId).select('riskLock').lean();
  return !!u?.riskLock;
}

/**
 * Clear risk lock after successful step-up verification. Admin can also clear.
 */
async function clearRiskLock(userId, opts = {}) {
  if (!userId) return false;
  const uid = userId.toString?.() || userId;
  await db.User.updateOne({ _id: uid }, { $set: { riskLock: false } });
  if (opts.adminId) {
    const { writeAdminAuditLog } = require('./auditLog');
    await writeAdminAuditLog({
      adminId: opts.adminId,
      action: 'clear_risk_lock',
      targetType: 'User',
      targetId: uid,
      meta: opts.meta || {},
    }).catch(() => {});
  }
  return true;
}

module.exports = {
  distanceKm,
  detectImpossibleTravel,
  recordLoginAndCheckATO,
  isRiskLocked,
  clearRiskLock,
};
