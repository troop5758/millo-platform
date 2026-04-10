/**
 * Central capability registry — shape + payment path matching.
 * https://milloapp.com
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('config/capabilities', () => {
  beforeEach(() => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_x');
    vi.stubEnv('PAYPAL_CLIENT_ID', 'p');
    vi.stubEnv('PAYPAL_CLIENT_SECRET', 's');
    vi.stubEnv('OAUTH_GOOGLE_CLIENT_ID', 'g');
    vi.stubEnv('OAUTH_GOOGLE_CLIENT_SECRET', 'gs');
    vi.stubEnv('JANUS_URL', 'http://janus/janus');
    vi.stubEnv('AI_MODERATION_ENABLED', 'true');
    vi.stubEnv('OPENAI_API_KEY', 'k');
    vi.stubEnv('EMAIL_PROVIDER', 'sendgrid');
    vi.stubEnv('EXPO_ACCESS_TOKEN', 'expo');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('getCapabilities returns nested booleans', () => {
    const { getCapabilities } = require('../config/capabilities.js');
    const c = getCapabilities();
    expect(c.payments.stripe).toBe(true);
    expect(c.payments.paypal).toBe(true);
    expect(c.payments.wise).toBe(false);
    expect(c.payments.anyConfigured).toBe(true);
    expect(c.auth.oauth).toBe(true);
    expect(c.auth.oauthGoogle).toBe(true);
    expect(c.live.janus).toBe(true);
    expect(c.moderation.ai).toBe(true);
    expect(c.notifications.email).toBe(true);
    expect(c.notifications.push).toBe(true);
    expect(c.trust).toBeDefined();
    expect(c.trust.payments).toMatch(/LIVE|BETA|DISABLED/);
    expect(c.trust.oauth).toMatch(/LIVE|BETA|DISABLED/);
    expect(c.infra.primaryDatabase).toBe('mongodb');
    expect(c.infra.kafkaBrokersConfigured).toBe(false);
    expect(c.infra.kafkaEventBusEnabled).toBe(false);
    expect(c.milla.chatAvailable).toBe(true);
  });

  it('infra.kafka flags distinguish broker env vs live bus', () => {
    const { getCapabilities: gc } = require('../config/capabilities.js');
    vi.stubEnv('KAFKA_BROKERS', 'localhost:9092');
    vi.stubEnv('KAFKA_ENABLED', 'false');
    const c = gc();
    expect(c.infra.kafkaBrokersConfigured).toBe(true);
    expect(c.infra.kafkaEventBusEnabled).toBe(false);
    vi.stubEnv('KAFKA_ENABLED', 'true');
    expect(gc().infra.kafkaEventBusEnabled).toBe(true);
  });

  it('isPaymentSurfacePath normalizes /api prefix', () => {
    const { isPaymentSurfacePath } = require('../config/capabilities.js');
    expect(isPaymentSurfacePath('/payments/wallet/transactions')).toBe(true);
    expect(isPaymentSurfacePath('/api/payments/wallet/transactions')).toBe(true);
    expect(isPaymentSurfacePath('/payout/batch')).toBe(true);
    expect(isPaymentSurfacePath('/webhooks/stripe')).toBe(true);
    expect(isPaymentSurfacePath('/health')).toBe(false);
  });

  it('notifications.email is false when EMAIL_PROVIDER is console', () => {
    vi.stubEnv('EMAIL_PROVIDER', 'console');
    const { getCapabilities } = require('../config/capabilities.js');
    expect(getCapabilities().notifications.email).toBe(false);
  });

  it('payments.anyConfigured is true when only Wise token set', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('WISE_API_TOKEN', 'wisetok');
    const { getCapabilities } = require('../config/capabilities.js');
    const c = getCapabilities();
    expect(c.payments.stripe).toBe(false);
    expect(c.payments.paypal).toBe(false);
    expect(c.payments.wise).toBe(true);
    expect(c.payments.anyConfigured).toBe(true);
  });
});
