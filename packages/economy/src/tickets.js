/**
 * Tickets — purchase ticket. Debit buyer, credit seller; ledger + audit.
 * https://milloapp.com
 */
const coins = require('./coins');
const { recordPaymentTransaction } = require('./paymentTransaction');

async function purchaseTicket(buyerId, ticketId, amountCents, sellerId, meta = {}) {
  await coins.debit(buyerId, amountCents, 'ticket', ticketId, { ...meta, sellerId: sellerId?.toString() });
  await coins.credit(sellerId, amountCents, 'ticket', ticketId, { ...meta, buyerId: buyerId?.toString() });
  recordPaymentTransaction({
    type: 'live_ticket',
    grossAmountCents: amountCents,
    platformFeeCents: 0,
    creatorAmountCents: amountCents,
    userId: buyerId,
    creatorId: sellerId,
    status: 'completed',
  }).catch(() => {});
  return { ok: true, ticketId, amountCents };
}

module.exports = { purchaseTicket };
