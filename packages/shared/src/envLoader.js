/**
 * Environment loader — Phase 1. Loads .env into process.env. No business logic.
 * https://milloapp.com
 */

const path = require('path');
const fs = require('fs');

function loadEnv(filePath) {
  const resolved = path.resolve(process.cwd(), filePath || '.env');
  try {
    const raw = fs.readFileSync(resolved, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

module.exports = { loadEnv };
