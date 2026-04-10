'use strict';
/**
 * Login step-up OTP — Redis-backed code + email delivery (5 min TTL).
 * https://milloapp.com
 */
const crypto = require('crypto');
const { redis } = require('../lib/redis');
const { sendEmailWithInboxFallback } = require('./notificationService');

const TTL_SEC = Number(process.env.LOGIN_OTP_TTL_SEC) || 300;

/**
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {object} [meta]
 * @param {string|null} [meta.deviceId]
 * @param {string|null} [meta.deviceType]
 * @param {string|null} [meta.email]
 * @returns {Promise<string>} otpId (client submits with code to /auth/verify-otp)
 */
async function issueOtp(userId, meta = {}) {
  const uid = String(userId.toString?.() || userId);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const otpId = crypto.randomBytes(16).toString('hex');
  const key = `login:otp:${otpId}`;
  const payload = JSON.stringify({
    userId: uid,
    code,
    deviceId: meta.deviceId || null,
    deviceType: meta.deviceType || null,
  });
  await redis.set(key, payload, 'EX', TTL_SEC);

  const email = meta.email;
  if (email) {
    await sendEmailWithInboxFallback({
      to: email,
      subject: 'Your Millo sign-in code',
      title: 'Sign-in verification',
      body: `Your one-time code is: ${code}. It expires in 5 minutes. If you did not try to sign in, secure your account.`,
      userId: uid,
      type: 'login_otp',
    }).catch(() => {});
  }

  return otpId;
}

/**
 * @param {string} otpId
 * @param {string} code
 * @returns {Promise<{ ok: boolean, userId?: string, deviceId?: string|null, deviceType?: string|null }>}
 */
async function verifyOtp(otpId, code) {
  if (!otpId || code == null || String(code).trim() === '') return { ok: false };
  const key = `login:otp:${String(otpId).trim()}`;
  const raw = await redis.get(key);
  if (!raw) return { ok: false };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false };
  }
  if (String(parsed.code) !== String(code).trim()) return { ok: false };
  await redis.del(key).catch(() => {});
  return {
    ok: true,
    userId: parsed.userId,
    deviceId: parsed.deviceId || null,
    deviceType: parsed.deviceType || null,
  };
}

module.exports = {
  issueOtp,
  verifyOtp,
  TTL_SEC,
};
