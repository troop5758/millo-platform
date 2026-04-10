/**
 * Consent logging — GDPR. Log and retrieve consent history. Cookie consent via purpose "cookies".
 * https://milloapp.com
 */
const db = require('@millo/database');

/** Purpose used when logging cookie consent (banner accept/decline). */
const COOKIE_CONSENT_PURPOSE = 'cookies';

/** Purpose for CCPA "Do Not Sell My Personal Information" opt-out. */
const CCPA_DO_NOT_SELL_PURPOSE = 'ccpa_do_not_sell';

/** Purpose for IP logging toggle. granted=false means user opts out of IP storage. */
const IP_LOGGING_PURPOSE = 'ip_logging';

async function logConsent(userId, purpose, version, granted, options = {}) {
  let ip = options.ip || null;
  if (ip && purpose !== IP_LOGGING_PURPOSE) {
    const status = await getIpLoggingStatus(userId);
    if (!status.allowIpLogging) ip = null;
  } else if (ip && purpose === IP_LOGGING_PURPOSE && !granted) {
    ip = null; // respect opt-out immediately for this record
  }
  await db.ConsentLog.create({
    userId,
    purpose,
    version: version || null,
    granted: Boolean(granted),
    ip,
    userAgent: options.userAgent || null,
    meta: options.meta || {},
  });
  return { ok: true };
}

/** Get IP logging preference. allowIpLogging=false means user opted out. */
async function getIpLoggingStatus(userId) {
  const log = await db.ConsentLog.findOne({ userId, purpose: IP_LOGGING_PURPOSE })
    .sort({ createdAt: -1 })
    .lean();
  return { allowIpLogging: log ? log.granted : true, lastUpdated: log?.createdAt || null };
}

/** Log IP logging preference. allowIpLogging=false opts out of IP storage. */
async function logIpLoggingPreference(userId, allowIpLogging, options = {}) {
  return logConsent(userId, IP_LOGGING_PURPOSE, options.version || '1', allowIpLogging, { ...options, ip: options.ip });
}

async function getConsentHistory(userId, limit = 200) {
  const logs = await db.ConsentLog.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return logs;
}

/** Log cookie consent (banner). Calls logConsent with purpose COOKIE_CONSENT_PURPOSE. */
async function logCookieConsent(userId, granted, options = {}) {
  return logConsent(userId, COOKIE_CONSENT_PURPOSE, options.version || '1', granted, options);
}

/** Get latest CCPA Do Not Sell status. granted=true means user opted out of sale. */
async function getCcpaDoNotSellStatus(userId) {
  const log = await db.ConsentLog.findOne({ userId, purpose: CCPA_DO_NOT_SELL_PURPOSE })
    .sort({ createdAt: -1 })
    .lean();
  return { optedOut: log ? log.granted : false, lastUpdated: log?.createdAt || null };
}

/** Log CCPA Do Not Sell opt-out. granted=true means user opts out of sale of personal info. */
async function logCcpaDoNotSell(userId, optedOut, options = {}) {
  return logConsent(userId, CCPA_DO_NOT_SELL_PURPOSE, options.version || '1', optedOut, options);
}

module.exports = {
  logConsent,
  getConsentHistory,
  logCookieConsent,
  logCcpaDoNotSell,
  getCcpaDoNotSellStatus,
  getIpLoggingStatus,
  logIpLoggingPreference,
  COOKIE_CONSENT_PURPOSE,
  CCPA_DO_NOT_SELL_PURPOSE,
  IP_LOGGING_PURPOSE,
};
