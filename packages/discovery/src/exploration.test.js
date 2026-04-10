'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { injectExploration } = require('./exploration');

test('injectExploration interleaves at ratio', () => {
  const main = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const explore = ['x', 'y', 'z'];
  const result = injectExploration(main, explore, 0.15, 10);
  assert.equal(result.length, 10);
  const expCount = result.filter((v) => ['x', 'y', 'z'].includes(v)).length;
  assert.ok(expCount >= 1, 'should inject at least one exploration item');
});

test('injectExploration fills from explore when main exhausted', () => {
  const main = ['a', 'b'];
  const explore = ['x', 'y', 'z'];
  const result = injectExploration(main, explore, 0.5, 5);
  assert.ok(result.length >= 3);
  assert.ok(result.includes('x') || result.includes('y') || result.includes('z'));
});
