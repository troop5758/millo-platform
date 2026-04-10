'use strict';
/**
 * SLA monitor cron job — runs checkSLA periodically to find overdue tickets and escalate.
 * https://milloapp.com
 */
const { checkSLA } = require('../services/slaMonitorService');

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 min

let _timer = null;

function start(intervalMs = DEFAULT_INTERVAL_MS, log = console) {
  stop();
  const run = () => {
    checkSLA({ log, notifyAdmins: true })
      .then((r) => {
        if ((r.responseBreached + r.resolutionBreached) > 0) {
          log.info?.(r, 'SLA monitor: breaches processed');
        }
      })
      .catch((err) => {
        log.warn?.({ err: err.message }, 'SLA monitor run failed');
      });
  };
  run();
  _timer = setInterval(run, intervalMs);
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { checkSLA: () => checkSLA({ notifyAdmins: true }), start, stop };
