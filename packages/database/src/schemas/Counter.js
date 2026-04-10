/**
 * Counter — named sequences for ticket numbers, etc. Atomic increment.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    name:  { type: String, required: true, unique: true },
    value: { type: Number, default: 0 },
  },
  { timestamps: false }
);

schema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('Counter', schema);
