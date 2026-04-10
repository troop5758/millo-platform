'use strict';
/**
 * Admin Configuration Routes — Manage system settings from the dashboard.
 * All routes require admin authentication.
 * https://milloapp.com
 */

const systemConfig = require('../services/systemConfigService');

async function resyncEmailFromPlatformIfNeeded(keys, log) {
  const list = Array.isArray(keys) ? keys : [keys];
  if (!list.some((k) => String(k || '').startsWith('email.'))) return;
  const { syncAndReloadEmailFromDatabase } = require('../services/emailRuntimeSync');
  await syncAndReloadEmailFromDatabase(log);
}

async function requireAdmin(request, reply) {
  const user = request.user;
  if (!user) {
    reply.status(401).send({ error: 'UNAUTHORIZED' });
    return false;
  }
  const isAdmin = user.role === 'admin' || user.roles?.includes('admin') || user.flags?.isAdmin;
  if (!isAdmin) {
    reply.status(403).send({ error: 'FORBIDDEN', message: 'Admin access required' });
    return false;
  }
  return true;
}

async function adminConfigRoutes(app) {
  /**
   * Get configuration schema (all categories and settings definitions).
   * Used by frontend to render configuration forms.
   * GET /admin/config/schema
   */
  app.get('/admin/config/schema', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const schema = systemConfig.getSchema();
    return reply.send({ schema });
  });

  /**
   * Get all configuration categories with current values.
   * GET /admin/config
   */
  app.get('/admin/config', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;

    try {
      const categories = await systemConfig.getAllCategories();
      return reply.send({ categories });
    } catch (err) {
      request.log.error({ err }, 'Failed to get configuration');
      return reply.status(500).send({ error: err.message });
    }
  });

  /**
   * Get configuration for a specific category.
   * GET /admin/config/:category
   */
  app.get('/admin/config/:category', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;

    const { category } = request.params;

    try {
      const categoryConfig = await systemConfig.getCategory(category);
      if (!categoryConfig) {
        return reply.status(404).send({ error: 'CATEGORY_NOT_FOUND' });
      }
      return reply.send(categoryConfig);
    } catch (err) {
      request.log.error({ err, category }, 'Failed to get category config');
      return reply.status(500).send({ error: err.message });
    }
  });

  /**
   * Get a specific configuration value.
   * GET /admin/config/key/:key
   */
  app.get('/admin/config/key/:key', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;

    const { key } = request.params;

    try {
      const settingDef = systemConfig.findSettingDefinition(key);
      if (!settingDef) {
        return reply.status(404).send({ error: 'KEY_NOT_FOUND' });
      }

      const value = await systemConfig.get(key);
      const source = await systemConfig.getValueSource(key);

      return reply.send({
        key,
        value: settingDef.sensitive ? (value ? '••••••••' : null) : value,
        hasValue: value !== null && value !== undefined && value !== '',
        source,
        definition: settingDef,
      });
    } catch (err) {
      return reply.status(500).send({ error: err.message });
    }
  });

  /**
   * Update a configuration value.
   * PUT /admin/config/key/:key
   * Body: { value: any }
   */
  app.put('/admin/config/key/:key', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;

    const { key } = request.params;
    const { value } = request.body || {};

    try {
      const result = await systemConfig.set(key, value, request.user?._id);
      await resyncEmailFromPlatformIfNeeded(key, request.log);
      request.log.info({ key, adminId: request.user?._id }, 'Configuration updated');
      return reply.send(result);
    } catch (err) {
      request.log.error({ err, key }, 'Failed to update configuration');
      return reply.status(400).send({ error: err.message });
    }
  });

  /**
   * Delete a configuration value (revert to env/default).
   * DELETE /admin/config/key/:key
   */
  app.delete('/admin/config/key/:key', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;

    const { key } = request.params;

    try {
      const result = await systemConfig.remove(key, request.user?._id);
      await resyncEmailFromPlatformIfNeeded(key, request.log);
      request.log.info({ key, adminId: request.user?._id }, 'Configuration deleted');
      return reply.send(result);
    } catch (err) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /**
   * Bulk update multiple configuration values.
   * POST /admin/config/bulk
   * Body: { updates: [{ key: string, value: any }] }
   */
  app.post('/admin/config/bulk', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;

    const { updates } = request.body || {};

    if (!Array.isArray(updates) || updates.length === 0) {
      return reply.status(400).send({ error: 'INVALID_UPDATES', message: 'updates must be a non-empty array' });
    }

    try {
      const results = await systemConfig.bulkUpdate(updates, request.user?._id);
      const success = results.filter((r) => r.success).length;
      await resyncEmailFromPlatformIfNeeded(
        updates.map((u) => u.key),
        request.log
      );
      request.log.info({ count: success, adminId: request.user?._id }, 'Bulk configuration update');
      return reply.send({ success, total: results.length, results });
    } catch (err) {
      return reply.status(500).send({ error: err.message });
    }
  });

  /**
   * Test a configuration category (e.g., test email, test Stripe).
   * POST /admin/config/:category/test
   */
  app.post('/admin/config/:category/test', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;

    const { category } = request.params;

    try {
      const result = await systemConfig.testConfiguration(category);
      return reply.send({ category, ...result });
    } catch (err) {
      return reply.status(500).send({ error: err.message });
    }
  });

  /**
   * Export all configuration for backup.
   * GET /admin/config/export
   */
  app.get('/admin/config/export', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;

    try {
      const backup = await systemConfig.exportConfig();
      reply.header('Content-Disposition', `attachment; filename="millo-config-${Date.now()}.json"`);
      reply.header('Content-Type', 'application/json');
      return reply.send(backup);
    } catch (err) {
      return reply.status(500).send({ error: err.message });
    }
  });

  /**
   * Import configuration from backup.
   * POST /admin/config/import
   * Body: { backup: { settings: [...] } }
   */
  app.post('/admin/config/import', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;

    const { backup } = request.body || {};

    if (!backup) {
      return reply.status(400).send({ error: 'INVALID_BACKUP' });
    }

    try {
      const result = await systemConfig.importConfig(backup, request.user?._id);
      try {
        const { syncAndReloadEmailFromDatabase } = require('../services/emailRuntimeSync');
        await syncAndReloadEmailFromDatabase(request.log);
      } catch (syncErr) {
        request.log.error({ err: syncErr }, 'Email resync after config import failed');
        return reply.status(400).send({ error: syncErr.message || 'Email configuration invalid after import' });
      }
      request.log.info({ imported: result.imported, adminId: request.user?._id }, 'Configuration imported');
      return reply.send(result);
    } catch (err) {
      return reply.status(400).send({ error: err.message });
    }
  });

  /**
   * Clear configuration cache.
   * POST /admin/config/clear-cache
   */
  app.post('/admin/config/clear-cache', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;

    systemConfig.clearCache();
    try {
      await resyncEmailFromPlatformIfNeeded(
        ['email.provider', 'email.from', 'email.sendgrid_api_key', 'email.resend_api_key', 'email.smtp_host', 'email.smtp_port', 'email.smtp_user', 'email.smtp_pass', 'email.smtp_secure'],
        request.log
      );
    } catch (err) {
      request.log.warn({ err }, 'Email resync after clear-cache failed');
    }
    return reply.send({ cleared: true });
  });

  /**
   * Get configuration health summary (which services are configured).
   * GET /admin/config/health
   */
  app.get('/admin/config/health', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;

    const health = {
      email: { configured: false, provider: null },
      payments: { configured: false, providers: [] },
      oauth: { configured: false, providers: [] },
      storage: { configured: false, provider: null },
      ai: { configured: false },
      streaming: { configured: false },
      eventbus: { configured: false },
      fraud: { configured: false },
    };

    try {
      // Check email
      const emailProvider = await systemConfig.get('email.provider');
      health.email.provider = emailProvider;
      health.email.configured = emailProvider && emailProvider !== 'console';

      // Check payments
      const stripeKey = await systemConfig.get('payments.stripe_secret_key');
      if (stripeKey) health.payments.providers.push('stripe');
      const paypalId = await systemConfig.get('payments.paypal_client_id');
      if (paypalId) health.payments.providers.push('paypal');
      const wiseKey = await systemConfig.get('payments.wise_api_key');
      if (wiseKey) health.payments.providers.push('wise');
      health.payments.configured = health.payments.providers.length > 0;

      // Check OAuth
      const googleId = await systemConfig.get('oauth.google_client_id');
      if (googleId) health.oauth.providers.push('google');
      const facebookId = await systemConfig.get('oauth.facebook_client_id');
      if (facebookId) health.oauth.providers.push('facebook');
      const appleId = await systemConfig.get('oauth.apple_client_id');
      if (appleId) health.oauth.providers.push('apple');
      health.oauth.configured = health.oauth.providers.length > 0;

      // Check storage
      const storageProvider = await systemConfig.get('storage.provider');
      health.storage.provider = storageProvider;
      health.storage.configured = storageProvider && storageProvider !== 'local';

      // Check AI
      const openaiKey = await systemConfig.get('ai.openai_api_key');
      health.ai.configured = !!openaiKey;

      // Check streaming
      const janusUrl = await systemConfig.get('streaming.janus_url');
      health.streaming.configured = !!janusUrl;

      // Check event bus
      const kafkaEnabled = await systemConfig.get('eventbus.kafka_enabled');
      const rabbitmqUrl = await systemConfig.get('eventbus.rabbitmq_url');
      health.eventbus.configured = kafkaEnabled === true || !!rabbitmqUrl;

      // Check fraud
      const siftKey = await systemConfig.get('fraud.sift_api_key');
      const maxmindKey = await systemConfig.get('fraud.maxmind_license_key');
      health.fraud.configured = !!siftKey || !!maxmindKey;

      // Check KYC
      const kycProvider = await systemConfig.get('kyc.provider');
      health.kyc = {
        configured: kycProvider && kycProvider !== 'none',
        provider: kycProvider || 'none',
        stubMode: !kycProvider || kycProvider === 'none',
      };

      return reply.send({ health });
    } catch (err) {
      return reply.status(500).send({ error: err.message });
    }
  });
}

module.exports = { adminConfigRoutes };
