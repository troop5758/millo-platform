/**
 * DeviceReputation — Device DNA / reputation per fingerprint. One doc per fingerprintId.
 * Reputation from linked accounts: banned vs trusted. Optional signals (WebGL, canvas, etc.) in meta.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    fingerprintId:    { type: String, required: true, unique: true, index: true },
    reputationScore: { type: Number, default: 50, min: 0, max: 100 },
    bannedAccounts:   { type: Number, default: 0 },
    trustedAccounts: { type: Number, default: 0 },
    lastSeen:         { type: Date, default: Date.now },
    meta:             {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      // Optional Device DNA signals: webgl, canvas, audio, gpuModel, fonts, deviceMemory, ipAsn, proxy
    },
  },
  { timestamps: true, _id: true }
);

schema.index({ fingerprintId: 1 }, { unique: true });
schema.index({ reputationScore: -1 });
schema.index({ lastSeen: -1 });

module.exports = mongoose.model('DeviceReputation', schema);
