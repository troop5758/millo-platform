const { describe, it } = require('node:test');
const assert = require('node:assert');
const { ageFromDateOfBirth, MINIMUM_AGE_YEARS } = require('./ageGating');

describe('ageGating', () => {
  it('ageFromDateOfBirth returns null for null', () => {
    assert.strictEqual(ageFromDateOfBirth(null), null);
  });
  it('ageFromDateOfBirth computes age correctly', () => {
    const twentyYearsAgo = new Date();
    twentyYearsAgo.setFullYear(twentyYearsAgo.getFullYear() - 20);
    assert.strictEqual(ageFromDateOfBirth(twentyYearsAgo), 20);
  });
  it('MINIMUM_AGE_YEARS is 13', () => {
    assert.strictEqual(MINIMUM_AGE_YEARS, 13);
  });
});
