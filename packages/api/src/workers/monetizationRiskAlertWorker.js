'use strict';
/**
 * Monetization Risk Alert Worker — periodically checks chargeback rate; if > threshold, alertFraudTeam('chargeback_spike').
 * https://milloapp.com
 */
const monetizationRiskAlertService = require('../services/monetizationRiskAlertService');

const DEFAULT_INTERVAL_MS = Number(process.env.MONETIZATION_ALERT_CHECK_INTERVAL_MS) || 60 * 60 * 1000; // 1 hour

let _timer = null;
let _log = console;

async function runChargebackCheck() {
  try {
    const result = await monetizationRiskAlertService.checkChargebackRateAlert();
    if (result.alerted) {
      _log.info?.({ rate: result.rate, chargebackCount: result.chargebackCount, total: result.total }, 'Monetization risk: chargeback spike alert sent');
    }
  } catch (e) {
    _log.warn?.({ err: e }, '[monetizationRiskAlertWorker] checkChargebackRateAlert error');
  }
}

function start(intervalMs = DEFAULT_INTERVAL_MS, log) {
  if (log) _log = log;
  stop();
  runChargebackCheck();
  _timer = setInterval(runChargebackCheck, intervalMs);
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { start, stop, runChargebackCheck };
