/**
 * NotificationLog — delivery observability for outbound notifications (email first).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    type: {
      type: String,
      enum: ['email', 'push', 'in_app', 'sms'],
      default: 'email',
      index: true,
    },
    /** queued: accepted for delivery; sent / failed / bounced: terminal */
    status: {
      type: String,
      enum: ['queued', 'sent', 'failed', 'bounced'],
      required: true,
      index: true,
    },
    provider: { type: String, default: 'unknown' },
    /** Notification template / logical kind (e.g. auth_magic_link). */
    templateKey: { type: String, index: true },
    to: { type: String, trim: true },
    subject: { type: String, trim: true },
    error: { type: String },
    /** Provider message id when available (SendGrid x-message-id, SES, etc.). */
    providerMessageId: { type: String, trim: true },
    /** Structured provider outcome (messageId, errors, transport hints) — diagnostics / support. */
    providerResponse: { type: mongoose.Schema.Types.Mixed },
    deliveredAt: { type: Date },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false, _id: true }
);

schema.index({ createdAt: -1 });
schema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('NotificationLog', schema);
