'use strict';
/**
 * Re-export authoritative AuditLog model from @millo/database.
 * Use writeAuditLog from ../services/auditLog for writes (fail-closed logging).
 * https://milloapp.com
 */
const { AuditLog } = require('@millo/database');

module.exports = AuditLog;
