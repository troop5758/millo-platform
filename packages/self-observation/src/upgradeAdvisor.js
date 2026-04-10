/**
 * Upgrade advisor — recommend upgrades (deps, Node). Read-only; no auto-changes.
 * https://milloapp.com
 */
const fs = require('fs');
const path = require('path');

function getUpgradeRecommendations(options = {}) {
  const root = options.root || process.cwd();
  const recommendations = [];
  const packagePath = path.join(root, 'package.json');

  if (!fs.existsSync(packagePath)) return { recommendations, autoChange: false };

  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const engines = pkg.engines?.node;
    if (engines) {
      recommendations.push({
        type: 'upgrade',
        category: 'engine',
        message: `Node: ensure runtime satisfies ${engines}. Current: ${process.version}`,
        severity: 'info',
        autoChange: false,
      });
    }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [name, range] of Object.entries(deps || {})) {
      if (range === '*' || range === 'latest') {
        recommendations.push({
          type: 'upgrade',
          category: 'dependency',
          message: `Dependency ${name} uses floating range (${range}). Consider pinning for reproducibility.`,
          severity: 'info',
          autoChange: false,
        });
      }
    }
  } catch (_) {}

  return { recommendations, autoChange: false };
}

module.exports = { getUpgradeRecommendations };
