'use strict';
/**
 * Trust graph model re-export (Millo stores schemas in @millo/database).
 * Usage: `const { TrustEdge } = require('./trustGraph.model');`
 * https://milloapp.com
 */
const db = require('@millo/database');

module.exports = {
  TrustEdge: db.TrustEdge,
  EDGE_TYPES: db.TrustEdge?.EDGE_TYPES,
};
