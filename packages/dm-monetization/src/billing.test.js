/**
 * Billing accuracy tested. https://milloapp.com
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const billing = require(path.resolve(__dirname, 'billing.js'));

describe('billing accuracy', () => {
  it('zero minutes = zero charge', () => {
    const { billableMinutes, amountCents } = billing.computeCharge(0, 5);
    assert.strictEqual(billableMinutes, 0);
    assert.strictEqual(amountCents, 0);
  });

  it('within free buffer = zero charge', () => {
    const { billableMinutes, amountCents } = billing.computeCharge(5, 5);
    assert.strictEqual(billableMinutes, 0);
    assert.strictEqual(amountCents, 0);
  });

  it('10 min total, 5 free buffer = 5 billable at 10 cents/min = 50 cents', () => {
    const { billableMinutes, amountCents } = billing.computeCharge(10, 5);
    assert.strictEqual(billableMinutes, 5);
    assert.strictEqual(amountCents, 50);
  });

  it('15 min total, 5 free buffer = 10 billable at 10 cents/min = 100 cents', () => {
    const { billableMinutes, amountCents } = billing.computeCharge(15, 5);
    assert.strictEqual(billableMinutes, 10);
    assert.strictEqual(amountCents, 100);
  });

  it('fractional minutes: 10.7 total, 5 free = 5 billable (floored)', () => {
    const { billableMinutes } = billing.computeCharge(10.7, 5);
    assert.strictEqual(billableMinutes, 5);
  });

  it('timeout cap: 200 min total capped at 120 = 115 billable (120-5 free)', () => {
    const prev = process.env.DM_MAX_SESSION_MINUTES;
    process.env.DM_MAX_SESSION_MINUTES = '120';
    const { billableMinutes, amountCents, capped } = billing.computeCharge(200, 5);
    assert.strictEqual(billableMinutes, 115);
    assert.strictEqual(amountCents, 1150);
    assert.strictEqual(capped, true);
    if (prev) process.env.DM_MAX_SESSION_MINUTES = prev;
    else delete process.env.DM_MAX_SESSION_MINUTES;
  });
});
