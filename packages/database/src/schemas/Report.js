/**
 * Report — user-submitted content report.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    reporterId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType:  { type: String, enum: ['stream', 'user', 'message', 'product', 'auction', 'comment', 'content'], required: true },
    targetId:    { type: String, required: true, index: true },
    reason:      { type: String, enum: ['spam', 'harassment', 'nudity', 'violence', 'misinformation', 'hate_speech', 'illegal_content', 'scam', 'copyright_violation', 'other'], required: true },
    description: { type: String, default: '', maxlength: 2000 },
    status:      { type: String, enum: ['open', 'reviewing', 'resolved', 'dismissed'], default: 'open', index: true },
    resolvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolution:  { type: String, default: '' },
    meta:        { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

schema.index({ status: 1, createdAt: -1 });
schema.index({ targetType: 1, targetId: 1 });
schema.index({ reporterId: 1, targetId: 1 }, { unique: true, sparse: true }); // one report per user per target

module.exports = mongoose.model('Report', schema);
