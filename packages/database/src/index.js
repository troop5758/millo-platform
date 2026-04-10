/**
 * Millo Database — MongoDB schemas (authoritative). Immutable Ledger (SQL optional).
 * Indexes compile. No controllers. https://milloapp.com
 */
const { connect, disconnect, mongoose } = require('./connection');
const { models, syncIndexes, ...schemas } = require('./schemas');
const auditWrites = require('./auditWrites');

module.exports = {
  connect,
  disconnect,
  mongoose,
  models,
  syncIndexes,
  ...auditWrites,
  ...schemas,
};
