/**
 * Behavior — session snapshot of interaction telemetry (mouse, clicks, keystroke timings).
 * Complements granular `BehaviorEvent` rows; suitable for batch ingests and model training exports.
 * Keystrokes store `{ t }` only (no key content). https://milloapp.com
 */
const mongoose = require('mongoose');

const point2dTime = new mongoose.Schema(
  {
    x: { type: Number },
    y: { type: Number },
    t: { type: Number },
  },
  { _id: false }
);

const keyTimeOnly = new mongoose.Schema(
  {
    t: { type: Number },
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null,
    },
    deviceId: { type: String, index: true, maxlength: 256 },
    mouseMoves: { type: [point2dTime], default: [] },
    clicks: { type: [point2dTime], default: [] },
    keystrokes: { type: [keyTimeOnly], default: [] },
    /** e.g. batch_ingest, login, payment_precheck */
    source: { type: String, index: true, maxlength: 64 },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

schema.index({ userId: 1, createdAt: -1 });
schema.index({ deviceId: 1, createdAt: -1 });

module.exports = mongoose.model('Behavior', schema);
