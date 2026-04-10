/**
 * Login RBA additive risk — unit tests (no DB).
 * https://milloapp.com
 */
import { describe, it, expect } from 'vitest';
const { scoreLoginRisk, decide } = await import('../services/riskEngine.service.js');

describe('riskEngine.service', () => {
  it('decide maps bands 80 / 60 / 40', () => {
    expect(decide(0)).toBe('ALLOW');
    expect(decide(39)).toBe('ALLOW');
    expect(decide(40)).toBe('CAPTCHA');
    expect(decide(59)).toBe('CAPTCHA');
    expect(decide(60)).toBe('STEP_UP');
    expect(decide(79)).toBe('STEP_UP');
    expect(decide(80)).toBe('BLOCK');
    expect(decide(200)).toBe('BLOCK');
  });

  it('scoreLoginRisk sums weighted signals', () => {
    expect(
      scoreLoginRisk({
        isNewDevice: true,
        isNewIp: true,
        geoMismatch: true,
        behaviorAnomaly: true,
        failedAttempts: 4,
      })
    ).toBe(130);
    expect(scoreLoginRisk({})).toBe(0);
    expect(scoreLoginRisk({ failedAttempts: 3 })).toBe(0);
    expect(scoreLoginRisk({ failedAttempts: 4 })).toBe(20);
  });
});
