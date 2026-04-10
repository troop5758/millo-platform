/**
 * Shared logger — Phase 1. No business logic.
 * https://milloapp.com
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const level = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function log(levelName, ...args) {
  if (LEVELS[levelName] > level) return;
  const prefix = `[millo][${levelName}]`;
  if (levelName === 'error') console.error(prefix, ...args);
  else console.log(prefix, ...args);
}

module.exports = {
  error: (...args) => log('error', ...args),
  warn: (...args) => log('warn', ...args),
  info: (...args) => log('info', ...args),
  debug: (...args) => log('debug', ...args),
  LEVELS,
};
