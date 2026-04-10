'use strict';
/**
 * Console email provider — log only, no delivery. Dev/testing only.
 * WARNING: Emails are NOT delivered. Users will not receive them.
 * Set EMAIL_PROVIDER=console.
 *
 * Production behavior:
 * - If EMAIL_CONSOLE_DISALLOWED=true, throws error
 * - Otherwise logs warning and stores in memory for debugging
 *
 * https://milloapp.com
 */

const isProduction = process.env.NODE_ENV === 'production';
const isDisallowed = process.env.EMAIL_CONSOLE_DISALLOWED === 'true';

// In-memory email log for debugging (limited to last 100)
const emailLog = [];
const MAX_LOG_SIZE = 100;

function createTransporter() {
  // Block in production if explicitly disallowed
  if (isProduction && isDisallowed) {
    throw new Error(
      '[Email] Console transport is DISALLOWED in production. ' +
      'Configure a real email provider: EMAIL_PROVIDER=sendgrid|aws_ses|resend|smtp'
    );
  }

  // Warn if using console in production
  if (isProduction) {
    console.warn(
      '╔════════════════════════════════════════════════════════════════╗\n' +
      '║  WARNING: Email console transport active in PRODUCTION!        ║\n' +
      '║  Users will NOT receive emails (password reset, verification). ║\n' +
      '║  Set EMAIL_PROVIDER=sendgrid|aws_ses|resend|smtp               ║\n' +
      '╚════════════════════════════════════════════════════════════════╝'
    );
  }

  return {
    sendMail: async (opts) => {
      const messageId = `console-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const entry = {
        messageId,
        to: opts.to,
        from: opts.from,
        subject: opts.subject,
        timestamp: new Date().toISOString(),
        // Don't log full HTML in production
        preview: isProduction ? undefined : (opts.html || opts.text || '').slice(0, 200),
      };

      // Store in memory log
      emailLog.push(entry);
      if (emailLog.length > MAX_LOG_SIZE) {
        emailLog.shift();
      }

      // Log with appropriate level
      if (isProduction) {
        console.warn('[Email — CONSOLE NOT DELIVERED]', { to: opts.to, subject: opts.subject });
      } else {
        console.log('[Email — console]', entry);
      }

      return {
        messageId,
        accepted: [opts.to],
        console: true,
        warning: isProduction ? 'EMAIL_NOT_DELIVERED' : undefined,
      };
    },
  };
}

/**
 * Get recent emails from console log (for debugging).
 */
function getEmailLog() {
  return [...emailLog];
}

/**
 * Clear email log.
 */
function clearEmailLog() {
  emailLog.length = 0;
}

module.exports = { createTransporter, getEmailLog, clearEmailLog };
