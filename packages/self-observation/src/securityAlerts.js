/**
 * Security alerts — recommend security improvements. Read-only; no auto-changes.
 * https://milloapp.com
 */
const fs = require('fs');
const path = require('path');

function getSecurityAlerts(options = {}) {
  const root = options.root || process.cwd();
  const alerts = [];

  const packagePath = path.join(root, 'package.json');
  if (fs.existsSync(packagePath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      if (!pkg.engines?.node) {
        alerts.push({
          type: 'security',
          category: 'manifest',
          message: 'package.json missing engines.node; pin Node version for consistent builds.',
          severity: 'info',
          autoChange: false,
        });
      }
    } catch (_) {}
  }

  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== undefined) {
    alerts.push({
      type: 'security',
      category: 'environment',
      message: 'NODE_ENV is not production. Ensure production uses NODE_ENV=production.',
      severity: 'info',
      autoChange: false,
    });
  }

  return { alerts, autoChange: false };
}

module.exports = { getSecurityAlerts };
