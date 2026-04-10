'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  dynamicPrice,
  dynamicPriceCents,
  computeDemandIndex,
} = require('./pricing.service');

test('dynamicPrice(10, 50) → 15', () => {
  assert.equal(dynamicPrice(10, 50), 15);
});

test('dynamicPriceCents returns base when disabled', () => {
  assert.equal(dynamicPriceCents(1000, { demandScore: 100 }, { enabled: false }), 1000);
});

test('dynamicPriceCents applies uplift when enabled', () => {
  const out = dynamicPriceCents(1000, { demandScore: 100 }, { enabled: true, maxUpliftPercent: 50 });
  assert.equal(out, 1500);
});

test('computeDemandIndex renormalizes when only demand is passed', () => {
  const idx = computeDemandIndex({ demandScore: 100 });
  assert.equal(idx, 100);
});

test('computeDemandIndex blends all channels when every signal key is present', () => {
  const idx = computeDemandIndex({
    demandScore: 100,
    engagementScore: 0,
    viewerCount: 0,
    creatorPopularity: 0,
  });
  assert.equal(idx, 35);
});
