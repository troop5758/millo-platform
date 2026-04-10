/**
 * PpvMassMessage — mass PPV: creator sends locked content to subscribers.
 * Recipients must pay to unlock. Major revenue driver on creator platforms.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    creatorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    messageText: { type: String, default: '' },
    contentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'PpvContent', required: true, index: true },
    priceCents: { type: Number, required: true },
    recipients:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    sentAt:      { type: Date, default: null },
    meta:        { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ creatorId: 1, createdAt: -1 });
schema.index({ contentId: 1 });
schema.index({ 'recipients': 1 });

module.exports = mongoose.model('PpvMassMessage', schema);
