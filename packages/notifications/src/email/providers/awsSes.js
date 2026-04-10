'use strict';
/**
 * AWS SES email provider — nodemailer SMTP or AWS SDK. Phase 3.
 * Set EMAIL_PROVIDER=aws_ses and either:
 *   AWS_SES_SMTP_HOST, AWS_SES_SMTP_USER, AWS_SES_SMTP_PASS (nodemailer SMTP)
 *   or AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (SDK)
 * https://milloapp.com
 */
const nodemailer = require('nodemailer');

function createTransporter() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const host = process.env.AWS_SES_SMTP_HOST || `email-smtp.${region}.amazonaws.com`;
  const user = process.env.AWS_SES_SMTP_USER || process.env.AWS_ACCESS_KEY_ID;
  const pass = process.env.AWS_SES_SMTP_PASS || process.env.AWS_SECRET_ACCESS_KEY;

  if (user && pass) {
    return nodemailer.createTransport({
      host,
      port: Number(process.env.AWS_SES_SMTP_PORT) || 587,
      secure: false,
      auth: { user, pass },
    });
  }

  try {
    const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
    const ses = new SESClient({ region });
    const from = process.env.EMAIL_FROM || 'no-reply@milloapp.com';
    return {
      sendMail: async (opts) => {
        const cmd = new SendEmailCommand({
          Source: from,
          Destination: { ToAddresses: Array.isArray(opts.to) ? opts.to : [opts.to] },
          Message: {
            Subject: { Data: opts.subject || '' },
            Body: {
              Html: opts.html ? { Data: opts.html } : undefined,
              Text: opts.text ? { Data: opts.text } : undefined,
            },
          },
          ReplyToAddresses: opts.replyTo ? [opts.replyTo] : undefined,
        });
        const res = await ses.send(cmd);
        return { messageId: res.MessageId, accepted: [opts.to] };
      },
    };
  } catch {
    return null;
  }
}

module.exports = { createTransporter };
