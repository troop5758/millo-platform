/**
 * Moderation and audit retention — policy constants for compliance. Data retained and included in DSAR.
 * https://milloapp.com
 */
const db = require('@millo/database');

const MODERATION_AUDIT_RETENTION_YEARS = Number(process.env.MODERATION_AUDIT_RETENTION_YEARS) || 7;
const ADMIN_AUDIT_RETENTION_YEARS = Number(process.env.ADMIN_AUDIT_RETENTION_YEARS) || 7;
const FINANCIAL_AUDIT_RETENTION_YEARS = Number(process.env.FINANCIAL_AUDIT_RETENTION_YEARS) || 7;

/**
 * Purge moderation data older than retention policy. Invoke via cron or worker.
 * ModerationLog only (Report has Appeal refs; keep per policy).
 * Returns { deleted: { moderationLog: n }, cutoff }.
 */
async function purgeExpiredModerationData() {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - MODERATION_AUDIT_RETENTION_YEARS);

  const modResult = await db.ModerationLog.deleteMany({ createdAt: { $lt: cutoff } });

  return {
    deleted: { moderationLog: modResult.deletedCount || 0 },
    cutoff: cutoff.toISOString(),
  };
}

/**
 * Purge AdminAuditLog older than retention policy.
 * Returns { deleted: number, cutoff }.
 */
async function purgeExpiredAdminAuditData() {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - ADMIN_AUDIT_RETENTION_YEARS);
  const result = await db.AdminAuditLog.deleteMany({ createdAt: { $lt: cutoff } });
  return { deleted: result.deletedCount || 0, cutoff: cutoff.toISOString() };
}

/**
 * Purge FinancialAuditLog older than retention policy.
 * Returns { deleted: number, cutoff }.
 */
async function purgeExpiredFinancialAuditData() {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - FINANCIAL_AUDIT_RETENTION_YEARS);
  const result = await db.FinancialAuditLog.deleteMany({ createdAt: { $lt: cutoff } });
  return { deleted: result.deletedCount || 0, cutoff: cutoff.toISOString() };
}

/**
 * Purge all expired audit data (moderation, admin, financial). Invoke via cron or worker.
 * Returns { deleted: { moderationLog, adminAuditLog, financialAuditLog }, cutoffs }.
 */
async function purgeAllExpiredAuditData() {
  const mod = await purgeExpiredModerationData();
  const admin = await purgeExpiredAdminAuditData();
  const financial = await purgeExpiredFinancialAuditData();
  return {
    deleted: {
      moderationLog: mod.deleted.moderationLog,
      adminAuditLog: admin.deleted,
      financialAuditLog: financial.deleted,
    },
    cutoffs: {
      moderation: mod.cutoff,
      admin: admin.cutoff,
      financial: financial.cutoff,
    },
  };
}

module.exports = {
  MODERATION_AUDIT_RETENTION_YEARS,
  ADMIN_AUDIT_RETENTION_YEARS,
  FINANCIAL_AUDIT_RETENTION_YEARS,
  purgeExpiredModerationData,
  purgeExpiredAdminAuditData,
  purgeExpiredFinancialAuditData,
  purgeAllExpiredAuditData,
};
