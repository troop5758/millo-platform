/**
 * ModerationTrainingData — labeled examples for adaptive risk engine / ML.
 * Stores features+label for moderation decisions (true fraud / false positive).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: String, index: true },
    contentId: { type: String, index: true },
    features: { type: mongoose.Schema.Types.Mixed, default: {} },
    label: { type: String, index: true }, // e.g. 'fraud', 'spam', 'harassment', 'clean'
    moderatorDecision: { type: String, index: true }, // e.g. 'true_positive', 'false_positive'
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    _id: true,
  }
);

schema.index({ createdAt: -1 });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ contentId: 1, createdAt: -1 });

module.exports = mongoose.model('ModerationTrainingData', schema);

