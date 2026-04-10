/**
 * BattleParticipant — MongoDB schema. https://milloapp.com
 * Fields: battleId (ref Battle, required), userId (ref User, required), score (default 0), rank. Timestamps.
 * Indexes: battleId+userId (unique), userId+createdAt.
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    battleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Battle', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    score: { type: Number, default: 0 },
    rank: { type: Number },
  },
  { timestamps: true, _id: true }
);

schema.index({ battleId: 1, userId: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('BattleParticipant', schema);
