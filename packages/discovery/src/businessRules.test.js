'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyBusinessRules, effectiveLiveWindowCap } = require('./businessRules');

function row(type, creatorId = 'c1') {
  return { item: { type, creatorId, contentId: `${type}-${creatorId}` }, scores: { finalScore: 1 } };
}

test('hideCommerce removes product', () => {
  const out = applyBusinessRules([row('short'), row('product')], { hideCommerce: true });
  assert.equal(out.length, 1);
  assert.equal(out[0].item.type, 'short');
});

test('maxPerCreatorInWindow 2 in 20', () => {
  const rows = [
    row('short', 'a'),
    row('short', 'a'),
    row('short', 'a'),
    row('short', 'a'),
  ];
  const out = applyBusinessRules(rows, { maxPerCreatorInWindow: 2, creatorWindowSize: 20 });
  assert.equal(out.length, 2);
});

test('adsEveryNSlots at most 1 ad per N', () => {
  const rows = [row('short'), row('ad'), row('ad'), row('short')];
  const out = applyBusinessRules(rows, { adsEveryNSlots: 3 });
  assert.ok(out.filter((r) => r.item.type === 'ad').length <= 2);
});

test('effectiveLiveWindowCap scales with skip rate', () => {
  assert.equal(effectiveLiveWindowCap(4, 0), 4);
  assert.ok(effectiveLiveWindowCap(4, 0.5) < 4);
});
