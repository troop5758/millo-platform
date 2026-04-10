'use strict';
/**
 * Creates an initial admin user during platform installation when no admin exists.
 * Uses INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD (temporary credentials; change in admin dashboard).
 * Also invoked by scripts/bootstrap-initial-admin.js for server installs (aaPanel-style one-time display).
 * https://milloapp.com
 */
const bcrypt = require('bcryptjs');
const db = require('@millo/database');

const BCRYPT_ROUNDS = 12;

/**
 * @param {Console} [log]
 * @returns {Promise<{ created: boolean, email?: string, reason?: string, userId?: string }>}
 */
async function ensureInitialAdmin(log = console) {
  const email = (process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = (process.env.INITIAL_ADMIN_PASSWORD || '').trim();

  if (!email || !password) {
    return { created: false, reason: 'missing_env' };
  }

  if (password.length < 8) {
    log.warn('Initial admin not created: INITIAL_ADMIN_PASSWORD must be at least 8 characters.');
    return { created: false, reason: 'password_short' };
  }

  const existingAdmin = await db.User.findOne({ role: 'admin' }).lean();
  if (existingAdmin) {
    return { created: false, reason: 'admin_exists' };
  }

  const existingEmail = await db.User.findOne({ email }).lean();
  if (existingEmail) {
    log.warn('Initial admin not created: a user with INITIAL_ADMIN_EMAIL already exists.');
    return { created: false, reason: 'email_taken' };
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await db.User.create({
    email,
    role: 'admin',
    status: 'active',
    emailVerified: true,
    flags: { passwordHash: hash, emailVerified: true },
  });

  await db.Profile.create({
    userId: user._id,
    displayName: 'Administrator',
    meta: { username: 'admin' },
  });

  await db.Wallet.create({ userId: user._id, balanceCents: 0 }).catch((err) => {
    log.warn({ err, userId: String(user._id) }, 'Wallet creation failed for initial admin');
  });

  log.info({ userId: String(user._id), email: user.email }, 'Initial admin created. Change the temporary password in Admin → Account.');
  return { created: true, email: user.email, userId: String(user._id) };
}

module.exports = { ensureInitialAdmin };
