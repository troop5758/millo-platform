/**
 * pricingApi.js unit tests — Vitest
 * Tests pure helpers: formatCents, PRICING_DEFAULTS structure.
 * https://milloapp.com
 */
import { describe, it, expect } from 'vitest';
import { formatCents, PRICING_DEFAULTS } from '../pricingApi.js';

describe('formatCents()', () => {
  it('formats whole dollars correctly', () => {
    expect(formatCents(500)).toBe('$5.00');
  });

  it('formats cents correctly', () => {
    expect(formatCents(99)).toBe('$0.99');
  });

  it('handles zero', () => {
    expect(formatCents(0)).toBe('$0.00');
  });

  it('handles large amounts', () => {
    expect(formatCents(99999)).toBe('$999.99');
  });
});

describe('PRICING_DEFAULTS', () => {
  it('has required subscription price key', () => {
    expect(PRICING_DEFAULTS).toHaveProperty('subscriptionPriceCents');
    expect(typeof PRICING_DEFAULTS.subscriptionPriceCents).toBe('number');
  });

  it('has required coin price keys', () => {
    expect(PRICING_DEFAULTS).toHaveProperty('coinPackages');
    expect(Array.isArray(PRICING_DEFAULTS.coinPackages)).toBe(true);
    expect(PRICING_DEFAULTS.coinPackages.length).toBeGreaterThan(0);
  });

  it('all coin packages have coins and priceCents', () => {
    for (const pkg of PRICING_DEFAULTS.coinPackages) {
      expect(typeof pkg.coins).toBe('number');
      expect(typeof pkg.priceCents).toBe('number');
      expect(pkg.coins).toBeGreaterThan(0);
      expect(pkg.priceCents).toBeGreaterThan(0);
    }
  });
});
