/**
 * Shadow output logs — optional callback for logging suggestions (never auto-applied).
 * Callers can set a logger to persist shadow output for analysis. https://milloapp.com
 */
let shadowOutputLogger = null;

function setShadowOutputLogger(fn) {
  shadowOutputLogger = typeof fn === 'function' ? fn : null;
}

function getShadowOutputLogger() {
  return shadowOutputLogger;
}

function logShadowOutput(type, payload) {
  if (shadowOutputLogger) {
    try {
      shadowOutputLogger({ type, timestamp: new Date().toISOString(), ...payload });
    } catch (_) {}
  }
}

module.exports = { setShadowOutputLogger, getShadowOutputLogger, logShadowOutput };
