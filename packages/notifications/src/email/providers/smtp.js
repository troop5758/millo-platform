'use strict';
/**
 * Generic SMTP email provider — nodemailer SMTP transport.
 * Set EMAIL_PROVIDER=smtp and configure:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 *   SMTP_SECURE (true for 465, false for 587)
 * https://milloapp.com
 */
const nodemailer = require('nodemailer');

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host) {
    console.warn('[SMTP] SMTP_HOST not configured');
    return null;
  }

  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  const config = {
    host,
    port,
    secure,
  };

  // Auth is optional for some SMTP servers
  if (user && pass) {
    config.auth = { user, pass };
  }

  // TLS options
  if (process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'false') {
    config.tls = { rejectUnauthorized: false };
  }

  try {
    const transporter = nodemailer.createTransport(config);

    // Verify connection on creation (async, non-blocking)
    transporter.verify().then(() => {
      console.info('[SMTP] Connection verified successfully');
    }).catch((err) => {
      console.error('[SMTP] Connection verification failed:', err.message);
    });

    return transporter;
  } catch (err) {
    console.error('[SMTP] Failed to create transporter:', err.message);
    return null;
  }
}

/**
 * Test SMTP connection.
 */
async function testConnection() {
  const transporter = createTransporter();
  if (!transporter) {
    return { ok: false, error: 'NO_TRANSPORTER' };
  }

  try {
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { createTransporter, testConnection };
