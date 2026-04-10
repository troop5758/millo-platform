'use strict';
/**
 * Monetization Risk Alerts — alert fraud team on suspicious gift loops, revenue spikes, chargeback spikes, abnormal subscriptions.
 * Example: if (chargebackRate > 5%) alertFraudTeam('chargeback_spike', { rate, ... }).
 * https://milloapp.com
 */
const db = require('@millo/database');

const CHARGEBACK_RATE_ALERT_THRESHOLD = Number(process.env.MONETIZATION_ALERT_CHARGEBACK_RATE_THRESHOLD) || 0.05; // 5%
const CHARGEBACK_WINDOW_DAYS = Number(process.env.MONETIZATION_ALERT_CHARGEBACK_WINDOW_DAYS) || 30;
const ALERT_DEBOUNCE_MS = Number(process.env.MONETIZATION_ALERT_DEBOUNCE_MS) || 60 * 60 * 1000; // 1 hour per trigger type

/**
 * Create alert and optionally notify fraud team (email when FRAUD_TEAM_EMAIL or INITIAL_ADMIN_EMAIL set).
 * When opts.debounceMs is set, skips creating a duplicate for the same trigger within that window.
 */
async function alertFraudTeam(trigger, meta = {}, opts = {}) {
  const debounceMs = opts.debounceMs ?? ALERT_DEBOUNCE_MS;
  if (debounceMs > 0) {
    const recent = await db.MonetizationRiskAlert.findOne({
      trigger,
      createdAt: { $gte: new Date(Date.now() - debounceMs) },
    }).lean();
    if (recent) return { created: false, debounced: true };
  }
  const severity = opts.severity || 'medium';
  const doc = await db.MonetizationRiskAlert.create({
    trigger,
    meta: meta && typeof meta === 'object' ? meta : {},
    severity,
  }).catch((e) => null);
  if (!doc) return { created: false };

  const email = process.env.FRAUD_TEAM_EMAIL || process.env.INITIAL_ADMIN_EMAIL;
  if (email) {
    try {
      const { sendEmailWithInboxFallback } = require('./notificationService');
      await sendEmailWithInboxFallback({
        to: email,
        subject: `[Millo] Monetization risk: ${trigger.replace(/_/g, ' ')}`,
        title: `Monetization risk alert: ${trigger.replace(/_/g, ' ')}`,
        body: `Trigger: ${trigger}. Check admin dashboard for details. Meta: ${JSON.stringify(meta).slice(0, 500)}`,
        // No specific userId for inbox here; alerts are also recorded in AdminAuditLog.
      });
    } catch (_) {}
  }

  try {
    await db.AdminAuditLog.create({
      action: 'monetization_risk_alert',
      adminId: null,
      targetType: 'MonetizationRiskAlert',
      targetId: doc._id.toString(),
      meta: { trigger, severity, ...meta },
    });
  } catch (_) {}

  return { created: true, alertId: doc._id };
}

/**
 * Get recent alerts for admin dashboard.
 */
async function getRecentAlerts(limit = 50, trigger = null) {
  const query = trigger ? { trigger } : {};
  const alerts = await db.MonetizationRiskAlert.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(200, Math.max(1, limit)))
    .lean();
  return alerts;
}

/**
 * Check platform chargeback rate; alert if above threshold (e.g. 5%).
 * if (chargebackRate > 5%) alertFraudTeam('chargeback_spike', { rate, ... })
 */
async function checkChargebackRateAlert() {
  const since = new Date(Date.now() - CHARGEBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [chargebackCount, paymentCount] = await Promise.all([
    db.Chargeback.countDocuments({ createdAt: { $gte: since } }),
    db.PaymentTransaction.countDocuments({ createdAt: { $gte: since } }).catch(() => 0),
  ]);

  const total = paymentCount || 1;
  const rate = chargebackCount / total;
  if (rate <= CHARGEBACK_RATE_ALERT_THRESHOLD) return { alerted: false, rate, chargebackCount, total };

  const recent = await db.MonetizationRiskAlert.findOne({
    trigger: 'chargeback_spike',
    createdAt: { $gte: new Date(Date.now() - ALERT_DEBOUNCE_MS) },
  }).lean();
  if (recent) return { alerted: false, rate, chargebackCount, total, debounced: true };

  await alertFraudTeam('chargeback_spike', {
    chargebackRate: rate,
    chargebackCount,
    paymentCount: total,
    windowDays: CHARGEBACK_WINDOW_DAYS,
    threshold: CHARGEBACK_RATE_ALERT_THRESHOLD,
  }, { severity: rate > 0.1 ? 'critical' : 'high' });
  return { alerted: true, rate, chargebackCount, total };
}

module.exports = {
  alertFraudTeam,
  getRecentAlerts,
  checkChargebackRateAlert,
  CHARGEBACK_RATE_ALERT_THRESHOLD,
  CHARGEBACK_WINDOW_DAYS,
};
