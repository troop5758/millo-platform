/**
 * Health dashboards — aggregate health status. Read-only; no auto-changes.
 * https://milloapp.com
 */
async function getHealthStatus(options = {}) {
  const checks = {
    node: { status: 'ok', version: process.version },
    uptime: { status: 'ok', seconds: Math.floor(process.uptime()) },
  };

  if (options.checkMongo === true) {
    try {
      const db = require('@millo/database');
      await db.connect(options.mongoUri);
      checks.mongodb = { status: 'ok' };
    } catch (e) {
      checks.mongodb = { status: 'degraded', message: e.message || 'Connection failed' };
    }
  }

  const allOk = Object.values(checks).every((c) => c.status === 'ok');
  return {
    status: allOk ? 'healthy' : 'degraded',
    checks,
    autoChange: false,
  };
}

function getHealthSummary() {
  return {
    status: process.uptime() >= 0 ? 'healthy' : 'unknown',
    node: process.version,
    uptimeSeconds: Math.floor(process.uptime()),
    autoChange: false,
  };
}

module.exports = { getHealthStatus, getHealthSummary };
