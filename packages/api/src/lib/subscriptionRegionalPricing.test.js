'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeRegionCode,
  regionalSubscriptionPriceUsd,
  regionalSubscriptionPriceCents,
  resolveRegionFromRequest,
} = require('./subscriptionRegionalPricing');

describe('subscriptionRegionalPricing', () => {
  it('US => $10 / 1000 cents', () => {
    assert.equal(regionalSubscriptionPriceUsd('US'), 10);
    assert.equal(regionalSubscriptionPriceUsd('us'), 10);
    assert.equal(regionalSubscriptionPriceCents('US'), 1000);
  });

  it('non-US => $5 / 500 cents', () => {
    assert.equal(regionalSubscriptionPriceUsd('GB'), 5);
    assert.equal(regionalSubscriptionPriceUsd('DE'), 5);
    assert.equal(regionalSubscriptionPriceCents('FR'), 500);
  });

  it('normalizeRegionCode defaults empty to US', () => {
    assert.equal(normalizeRegionCode(''), 'US');
    assert.equal(normalizeRegionCode(null), 'US');
  });

  it('resolveRegionFromRequest reads query and headers', () => {
    assert.equal(
      resolveRegionFromRequest({
        body: {},
        query: { region: 'ca' },
        headers: {},
      }),
      'CA',
    );
    assert.equal(
      resolveRegionFromRequest({
        body: {},
        query: {},
        headers: { 'x-region': 'US' },
      }),
      'US',
    );
  });
});
