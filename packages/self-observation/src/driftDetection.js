/**
 * Drift detection — compare current state to expected. Read-only; no auto-changes.
 * https://milloapp.com
 */
const fs = require('fs');
const path = require('path');

const EXPECTED_NODE_MAJOR = 18;
const EXPECTED_DOMAIN = 'https://milloapp.com';

function detectDrift(options = {}) {
  const root = options.root || path.resolve(process.cwd(), '..');
  const recommendations = [];

  const nodeVersion = process.version.slice(1).split('.')[0];
  if (parseInt(nodeVersion, 10) < EXPECTED_NODE_MAJOR) {
    recommendations.push({
      type: 'drift',
      category: 'runtime',
      message: `Node major version ${nodeVersion} is below expected ${EXPECTED_NODE_MAJOR}`,
      severity: 'warning',
      autoChange: false,
    });
  }

  if (process.env.MILLO_APP_URL && process.env.MILLO_APP_URL !== EXPECTED_DOMAIN) {
    recommendations.push({
      type: 'drift',
      category: 'config',
      message: `APP_URL (${process.env.MILLO_APP_URL}) differs from expected ${EXPECTED_DOMAIN}`,
      severity: 'info',
      autoChange: false,
    });
  }

  const packagePath = path.join(root, 'package.json');
  if (fs.existsSync(packagePath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      const engines = pkg.engines?.node;
      if (engines && !engines.includes(String(EXPECTED_NODE_MAJOR))) {
        recommendations.push({
          type: 'drift',
          category: 'manifest',
          message: `package.json engines.node (${engines}) may not match expected Node ${EXPECTED_NODE_MAJOR}+`,
          severity: 'info',
          autoChange: false,
        });
      }
    } catch (_) {}
  }

  return { recommendations, autoChange: false };
}

module.exports = { detectDrift };
