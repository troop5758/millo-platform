/**
 * Penalty — abuse or commerce violation. https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    type:       { type: String, enum: ['abuse', 'commerce_violation'], required: true, index: true },
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reason:     { type: String, default: '' },
    appliedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    refType:    { type: String, default: null },
    refId:      { type: String, default: null },
    meta:       { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ type: 1 });
schema.index({ userId: 1, type: 1 });
schema.index({ createdAt: -1 });

module.exports = mongoose.model('Penalty', schema);
