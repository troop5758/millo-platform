'use strict';
/**
 * Resend email provider. Phase 3.
 * Set EMAIL_PROVIDER=resend and RESEND_API_KEY.
 * https://milloapp.com
 */
function createTransporter() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  try {
    const { Resend } = require('resend');
    const resend = new Resend(apiKey);
    const from = process.env.EMAIL_FROM || 'Millo <onboarding@resend.dev>';
    return {
      sendMail: async (opts) => {
        const { data, error } = await resend.emails.send({
          from: opts.from || from,
          to: Array.isArray(opts.to) ? opts.to[0] : opts.to,
          subject: opts.subject || '',
          html: opts.html,
          text: opts.text,
          reply_to: opts.replyTo,
        });
        if (error) throw new Error(error.message);
        return { messageId: data?.id, accepted: [opts.to] };
      },
    };
  } catch {
    return null;
  }
}

module.exports = { createTransporter };
