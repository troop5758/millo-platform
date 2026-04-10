/**

 * ContentFeatures — per-content engagement + metadata for discovery / reranking.

 * One row per content item (short, live, product, ad).

 * https://milloapp.com

 */

const mongoose = require('mongoose');



const CONTENT_TYPES = ['short', 'live', 'product', 'ad'];

const MODERATION_STATES = ['pending', 'approved', 'rejected', 'restricted'];



const schema = new mongoose.Schema(

  {

    contentId: { type: String, required: true, index: true, unique: true },

    creatorId: { type: String, required: true, index: true },

    type: { type: String, enum: CONTENT_TYPES, default: 'short', index: true },

    language: { type: String, default: 'en' },

    region: { type: String, default: 'US' },

    topics: { type: [String], default: [] },

    hashtags: { type: [String], default: [] },

    durationSec: { type: Number, default: 0 },

    moderationState: {

      type: String,

      enum: MODERATION_STATES,

      default: 'approved',

      index: true,

    },

    trustScore: { type: Number, default: 0 },

    ctr1h: { type: Number, default: 0 },

    ctr24h: { type: Number, default: 0 },

    avgWatchTime1h: { type: Number, default: 0 },

    avgWatchTime24h: { type: Number, default: 0 },

    completionRate1h: { type: Number, default: 0 },

    completionRate24h: { type: Number, default: 0 },

    shareRate24h: { type: Number, default: 0 },

    commentRate24h: { type: Number, default: 0 },

    followConversion24h: { type: Number, default: 0 },

    giftConversion24h: { type: Number, default: 0 },

    purchaseConversion24h: { type: Number, default: 0 },

    negativeRate24h: { type: Number, default: 0 },

    embedding: { type: [Number], default: [] },

  },

  { _id: true, timestamps: true }

);



schema.index({ creatorId: 1, createdAt: -1 });

schema.index({ moderationState: 1, createdAt: -1 });

schema.index({ language: 1, createdAt: -1 });

schema.index({ topics: 1, createdAt: -1 });



module.exports = mongoose.model('ContentFeatures', schema);

module.exports.CONTENT_TYPES = CONTENT_TYPES;

module.exports.MODERATION_STATES = MODERATION_STATES;

