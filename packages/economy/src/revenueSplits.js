/**
 * Revenue splits — split revenue between parties; each share credited via ledger.
 * https://milloapp.com
 */
const coins = require('./coins');

async function recordRevenue(amountCents, splits, refType, refId, meta = {}) {
  const totalPercent = splits.reduce((s, x) => s + (x.percent || 0), 0);
  if (Math.abs(totalPercent - 100) > 0.01) throw new Error('SPLITS_MUST_SUM_TO_100');
  for (const { userId, percent } of splits) {
    const share = Math.floor((amountCents * percent) / 100);
    if (share > 0) await coins.credit(userId, share, refType || 'revenue_split', refId, { ...meta, percent });
  }
  return { ok: true, amountCents, splits: splits.length };
}

module.exports = { recordRevenue };
