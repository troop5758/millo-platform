'use strict';
/**
 * SendGrid email provider — nodemailer transport. Phase 3.
 * Set EMAIL_PROVIDER=sendgrid and SENDGRID_API_KEY.
 * https://milloapp.com
 */
const nodemailer = require('nodemailer');

function createTransporter() {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return null;
  try {
    const nodemailerSendgrid = require('nodemailer-sendgrid');
    return nodemailer.createTransport(
      nodemailerSendgrid({ apiKey })
    );
  } catch (err) {
    // Fallback: @sendgrid/mail (no nodemailer transport)
    const sg = require('@sendgrid/mail');
    sg.setApiKey(apiKey);
    return {
      sendMail: async (opts) => {
        const [res] = await sg.send({
          to: opts.to,
          from: opts.from,
          subject: opts.subject,
          html: opts.html,
          text: opts.text,
          replyTo: opts.replyTo,
        });
        return { messageId: res?.headers?.['x-message-id'], accepted: [opts.to] };
      },
    };
  }
}

module.exports = { createTransporter };
