/**
 * TVChannel — MongoDB schema. https://milloapp.com
 * Fields: name (required), slug (required), status (enum active|archived), meta (mixed). Timestamps.
 * Indexes: slug (unique), status.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ slug: 1 }, { unique: true });
schema.index({ status: 1 });

module.exports = mongoose.model('TVChannel', schema);
