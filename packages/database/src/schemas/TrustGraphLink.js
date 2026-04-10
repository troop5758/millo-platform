/**
 * TrustGraphLink — heterogeneous trust/risk graph (MongoDB adjacency).
 * Nodes: user | device | ip | payment_method. Edges: USES | CONNECTED_TO | TRANSACTS_WITH.
 * Dual-write to Neo4j when available (see packages/api trust.service.js).
 * https://milloapp.com
 */
const mongoose = require('mongoose');

const NODE_KINDS = ['user', 'device', 'ip', 'payment_method'];
const EDGE_TYPES = ['USES', 'CONNECTED_TO', 'TRANSACTS_WITH'];

const schema = new mongoose.Schema(
  {
    fromKind: { type: String, enum: NODE_KINDS, required: true, index: true },
    fromId: { type: String, required: true, index: true },
    toKind: { type: String, enum: NODE_KINDS, required: true, index: true },
    toId: { type: String, required: true, index: true },
    edgeType: { type: String, enum: EDGE_TYPES, required: true, index: true },
    weight: { type: Number, default: 1 },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, _id: true }
);

schema.index({ fromKind: 1, fromId: 1, toKind: 1, toId: 1, edgeType: 1 }, { unique: true });
schema.index({ toKind: 1, toId: 1, edgeType: 1 });

module.exports = mongoose.model('TrustGraphLink', schema);
module.exports.NODE_KINDS = NODE_KINDS;
module.exports.EDGE_TYPES = EDGE_TYPES;
