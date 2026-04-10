/**
 * MusicLicense — License type for royalty-free music (e.g. platform royalty-free, CC-BY).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    slug:        { type: String, required: true, unique: true, trim: true },
    description: { type: String, default: '' },
    url:         { type: String, default: '' },
    allowsCommercial: { type: Boolean, default: true },
    requiresAttribution: { type: Boolean, default: false },
    meta:        { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ slug: 1 });

module.exports = mongoose.model('MusicLicense', schema);
