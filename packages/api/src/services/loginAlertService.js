'use strict';
/**
 * Login alerts — notify user on new device or new location (suspicious login detection).
 * When LOGIN_ALERT_EMAIL_ENABLED=true, sends email if this device or country was never seen for this user.
 * https://milloapp.com
 */
const db = require('@millo/database');
const { sendEmailWithInboxFallback } = require('./notificationService');

const ENABLED = process.env.LOGIN_ALERT_EMAIL_ENABLED === 'true';

/**
 * Check if this login is from a new device or new location.
 * New device = only one session with this deviceId (the one just created).
 * New location = no previous LoginAudit with this country for this user.
 */
async function isNewDeviceOrLocation(userId, deviceId, country) {
  if (!userId) return { isNewDevice: false, isNewLocation: false };
  const uid = userId.toString?.() || userId;
  const [sessionCountWithDevice, loginCountInCountry] = await Promise.all([
    deviceId
      ? db.Session.countDocuments({ userId: uid, deviceId: String(deviceId).slice(0, 256) })
      : Promise.resolve(0),
    country
      ? db.LoginAudit.countDocuments({ userId: uid, country: String(country).trim() })
      : Promise.resolve(0),
  ]);
  return {
    isNewDevice: !!deviceId && sessionCountWithDevice <= 1,
    isNewLocation: !!country && loginCountInCountry <= 1,
  };
}

/**
 * Send "New login to your account" email. Call when isNewDevice or isNewLocation.
 */
async function sendLoginAlertEmail(user, opts = {}) {
  const { deviceName, location, ip } = opts;
  if (!user?.email) return;
  try {
    const branding = require('@millo/notifications/src/branding');
    const appName = (branding && branding.getAppName && branding.getAppName()) || 'Millo';
    const body = [
      'A new sign-in to your account was detected.',
      deviceName ? `Device: ${deviceName}` : null,
      location ? `Location: ${location}` : null,
      ip ? `IP: ${ip}` : null,
      '',
      'If this wasn’t you, please change your password and revoke other sessions from your account settings.',
    ].filter(Boolean).join('\n');

    await sendEmailWithInboxFallback({
      to: user.email,
      subject: `New sign-in to your ${appName} account`,
      title: `New sign-in to your ${appName} account`,
      body,
      userId: user._id,
      type: 'login_alert',
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[loginAlertService] sendLoginAlertEmail failed:', err?.message);
    }
  }
}

/**
 * After successful login: if new device or new location and alerts enabled, send email.
 * Call from auth controller after Session.create.
 * @param {Object} user - { _id, email }
 * @param {Object} opts - { deviceId, country, deviceName, location, ip }
 */
async function maybeSendLoginAlert(user, opts = {}) {
  if (!ENABLED || !user?._id) return;
  const { deviceId, country, deviceName, location, ip } = opts;
  const { isNewDevice, isNewLocation } = await isNewDeviceOrLocation(user._id, deviceId, country);
  if (isNewDevice || isNewLocation) {
    await sendLoginAlertEmail(user, { deviceName, location, ip });
  }
}

function isLoginAlertEnabled() {
  return ENABLED;
}

module.exports = { maybeSendLoginAlert, isNewDeviceOrLocation, sendLoginAlertEmail, isLoginAlertEnabled };
