'use strict';
/**
 * Centralized audit writers — failures log and rethrow (fail closed on audit loss).
 * Used by API, billing, economy, and workers. https://milloapp.com
 */
const AdminAuditLog = require('./schemas/AdminAuditLog');
const FinancialAuditLog = require('./schemas/FinancialAuditLog');
const AuditLog = require('./schemas/AuditLog');

async function writeAdminAuditLog(entry) {
  try {
    await AdminAuditLog.create(entry);
  } catch (err) {
    console.error('AUDIT LOG FAILURE [AdminAuditLog]', err);
    throw err;
  }
}

async function writeFinancialAuditLog(entry) {
  try {
    await FinancialAuditLog.create(entry);
  } catch (err) {
    console.error('AUDIT LOG FAILURE [FinancialAuditLog]', err);
    throw err;
  }
}

/**
 * Normalize shorthand fields (userId / adminId / reason) for AuditLog.create compatibility.
 * @param {Record<string, unknown>} entry
 */
function normalizeAuditLogEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const out = { ...entry };
  if (out.adminId != null && out.actorId == null) {
    out.actorId = out.adminId;
  }
  if (out.userId != null && out.resourceId == null) {
    out.resourceType = out.resourceType || 'User';
    out.resourceId = String(out.userId);
  }
  const baseMeta =
    out.meta && typeof out.meta === 'object' && !Array.isArray(out.meta) ? { ...out.meta } : {};
  if (out.reason != null && baseMeta.reason == null) {
    baseMeta.reason = out.reason;
  }
  if (Object.keys(baseMeta).length) out.meta = baseMeta;
  return out;
}

/** General sensitive / compliance actions (disputes opened, KYC state, enforcement, etc.). */
async function writeAuditLog(entry) {
  try {
    await AuditLog.create(normalizeAuditLogEntry(entry));
  } catch (err) {
    console.error('AUDIT LOG FAILURE [AuditLog]', err);
    throw err;
  }
}

module.exports = {
  writeAdminAuditLog,
  writeFinancialAuditLog,
  writeAuditLog,
  normalizeAuditLogEntry,
};
