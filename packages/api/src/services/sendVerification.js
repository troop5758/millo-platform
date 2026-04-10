'use strict';
/**
 * Account verification — email, phone, identity.
 * Creates tokens, stores in VerificationToken, sends verification messages.
 * https://milloapp.com
 */
const crypto = require('crypto');
const db = require('@millo/database');
const { sendEmailWithInboxFallback } = require('./notificationService');

const DEFAULT_EMAIL_EXPIRY_HOURS = 24;

/**
 * Send email verification for a user.
 * Creates a token, stores it, and sends the verification email.
 * @param {Object} user - User document (must have _id, email)
 * @param {Object} opts - { displayName, subject, title, body, expiryHours }
 * @returns {Promise<{ token: string, verifyUrl: string }>}
 */
async function sendEmailVerification(user, opts = {}) {
  const displayName = opts.displayName || user.email?.split('@')[0] || 'there';
  const expiryHours = opts.expiryHours ?? DEFAULT_EMAIL_EXPIRY_HOURS;
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  await db.VerificationToken.deleteMany({ userId: user._id, type: 'email' });
  await db.VerificationToken.create({
    userId: user._id,
    token,
    type: 'email',
    expiresAt,
  });

  const frontendUrl = process.env.FRONTEND_URL || (process.env.APP_URL || 'https://milloapp.com').replace(/:\d+$/, ':5173');
  const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;

  await sendEmailWithInboxFallback({
    to: user.email,
    subject: opts.subject ?? 'Verify your Millo email',
    title: opts.title ?? 'Verify your email',
    variant: 'auto',
    body: opts.body ?? `Hi ${displayName}, please verify your email to unlock all features. Click the button below to verify your email address.`,
    ctaUrl: verifyUrl,
    ctaText: opts.ctaText ?? 'Verify Email',
    userId: user._id,
    type: 'verify_email',
  });

  return { token, verifyUrl };
}

/**
 * Verify an email token and mark user as verified.
 * @param {string} token - Verification token from query/link
 * @returns {Promise<{ ok: boolean, userId?: ObjectId, error?: string }>}
 */
async function verifyEmailToken(token) {
  if (!token) return { ok: false, error: 'TOKEN_REQUIRED' };

  const record = await db.VerificationToken.findOne({ token, type: 'email' }).lean();
  if (!record) return { ok: false, error: 'INVALID_OR_EXPIRED_TOKEN' };
  if (new Date(record.expiresAt) < new Date()) {
    await db.VerificationToken.deleteOne({ _id: record._id });
    return { ok: false, error: 'TOKEN_EXPIRED' };
  }

  await db.User.updateOne(
    { _id: record.userId },
    { $set: { emailVerified: true, 'flags.emailVerified': true } }
  );
  await db.VerificationToken.deleteOne({ _id: record._id });

  return { ok: true, userId: record.userId };
}

module.exports = { sendEmailVerification, verifyEmailToken };
