'use strict';
/**
 * Auction payment deadline worker (Phase 5). Flow:
 * 1. Check expired auctions (awaiting_payment, deadline < now).
 * 2. Check if payment completed (paidAt / meta.paidAt); skip if paid.
 * 3. If not paid → reassign to next bidder; if no next bidder → mark defaulted.
 * 4. Apply penalty to defaulted winner (commerce_violation).
 * https://milloapp.com
 */
const { runAuctionPaymentEnforcement } = require('@millo/economy');

const DEFAULT_INTERVAL_MS = Number(process.env.AUCTION_PAYMENT_WORKER_INTERVAL_MS) || 15 * 60 * 1000; // 15m

let _timer = null;

/**
 * One-off run: process overdue auction payments (reassign or default), penalties, paidAt skip.
 */
async function runSync() {
  try {
    const out = await runAuctionPaymentEnforcement();
    const skippedNotDue = out.skippedNotDue ?? out.skippedPaid ?? 0;
    return { ...out, skippedNotDue, skippedPaid: skippedNotDue };
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[auctionDeadlineWorker] runSync error:', e.message);
    }
    return { processed: 0, skippedNotDue: 0, skippedPaid: 0, defaulted: 0, reassigned: 0, error: e.message };
  }
}

async function start(intervalMs = DEFAULT_INTERVAL_MS) {
  stop();
  await runSync();
  _timer = setInterval(() => {
    runSync().catch(() => {});
  }, intervalMs);
}

function stop() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

module.exports = { runSync, start, stop };
