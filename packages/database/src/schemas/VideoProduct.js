'use strict';
/**
 * VideoProduct — shop the look: link product to short video with position overlay.
 * Fields: contentId (stream/video), productId, position {x, y} (0-100 percent).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    contentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'LiveStream', required: true, index: true },
    productId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    position:   {
      x: { type: Number, default: 20 },   // 0-100 percent from left
      y: { type: Number, default: 80 },   // 0-100 percent from top
    },
    sortOrder:  { type: Number, default: 0 },
  },
  { timestamps: true, _id: true }
);

schema.index({ contentId: 1, productId: 1 }, { unique: true });
schema.index({ contentId: 1, sortOrder: 1 });

module.exports = mongoose.model('VideoProduct', schema);
