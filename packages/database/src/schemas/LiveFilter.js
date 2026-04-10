/**
 * LiveFilter — MongoDB schema. Filter version pinning for live streams and recordings.
 * Fields: name (filter id), version, is_active. Ensures stable filters for recordings.
 * Indexes: name+version (unique), name+is_active.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    version: { type: String, required: true },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true, _id: true }
);

schema.index({ name: 1, version: 1 }, { unique: true });
schema.index({ name: 1, is_active: 1 });

module.exports = mongoose.model('LiveFilter', schema);
