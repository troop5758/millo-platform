/**
 * MlFeatureSnapshot — feature vectors from events for ML training (unlabeled).
 * Populated by featureGenerator worker; ML pipeline joins with labels when available.
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: String, index: true },
    contentId: { type: String, index: true },
    eventType: { type: String, index: true },
    features: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false }, _id: true }
);

schema.index({ createdAt: -1 });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ contentId: 1, createdAt: -1 });

module.exports = mongoose.model('MlFeatureSnapshot', schema);
