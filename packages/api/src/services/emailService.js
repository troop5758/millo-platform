'use strict';
/**
 * Email service — SendGrid. Replaces email stub.
 * Set SENDGRID_KEY or SENDGRID_API_KEY. https://milloapp.com
 */
const sg = require('@sendgrid/mail');

const apiKey = process.env.SENDGRID_KEY || process.env.SENDGRID_API_KEY;
if (apiKey) sg.setApiKey(apiKey);

async function sendEmail(to, subject, html) {
  if (!apiKey) throw new Error('SENDGRID_KEY_REQUIRED');
  await sg.send({
    to,
    from: 'no-reply@milloapp.com',
    subject,
    html,
  });
}

module.exports = { sendEmail };
