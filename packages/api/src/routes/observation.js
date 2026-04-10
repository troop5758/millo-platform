/**
 * Self-observation API — drift, upgrade advisor, health, security. Read-only; no auto-changes.
 * Admin-only: exposes internal system state, package versions, and security alerts.
 * https://milloapp.com
 */
const observation = require('@millo/self-observation');

async function requireAdmin(request, reply) {
  const user = request.user;
  if (!user) { reply.status(401).send({ error: 'UNAUTHORIZED' }); return false; }
  if (user.role !== 'admin') { reply.status(403).send({ error: 'FORBIDDEN' }); return false; }
  return true;
}

async function observationRoutes(app) {
  app.get('/observation/recommendations', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const out = await observation.getRecommendations({ checkMongo: false });
    return reply.send(out);
  });

  app.get('/observation/drift', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const out = observation.detectDrift({ root: process.cwd() });
    return reply.send(out);
  });

  app.get('/observation/upgrade', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const out = observation.getUpgradeRecommendations({ root: process.cwd() });
    return reply.send(out);
  });

  app.get('/observation/health', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const out = observation.getHealthSummary();
    return reply.send(out);
  });

  app.get('/observation/security', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const out = observation.getSecurityAlerts({ root: process.cwd() });
    return reply.send(out);
  });

  app.get('/observation/queues', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const out = await observation.getQueueStats().catch(() => ({ queues: [], message: 'Queue stats unavailable' }));
    return reply.send(out);
  });

  app.get('/workers/metrics', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    const out = await observation.getWorkerMetrics().catch(() => ({ jobs_processed: 0, failures: 0, queues: [] }));
    return reply.send(out);
  });

  /* ── Email service health ── */
  app.get('/observation/email', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    try {
      const notifications = require('@millo/notifications');
      const health = await notifications.emailHealthCheck();
      const config = notifications.getEmailConfigStatus();
      return reply.send({
        ...health,
        config: {
          provider: config.provider,
          valid: config.valid,
          realProvider: config.realProvider,
          from: config.from,
          warnings: config.warnings,
          errors: config.errors,
        },
      });
    } catch (err) {
      return reply.send({
        healthy: false,
        error: err.message,
      });
    }
  });

  /* ── OAuth providers status ── */
  app.get('/observation/oauth', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    try {
      const oauthProviders = require('../services/oauthProviders');
      const validation = oauthProviders.validateOAuthConfig({ log: request.log });
      return reply.send({
        enabled: oauthProviders.getEnabledProviders(),
        disabled: oauthProviders.getDisabledProviders(),
        validation,
      });
    } catch (err) {
      return reply.send({ error: err.message });
    }
  });

  /* ── Event bus status ── */
  app.get('/observation/eventbus', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    try {
      const orchestrator = require('../workers/eventBusOrchestrator');
      return reply.send({
        status: orchestrator.getStatus(),
        health: orchestrator.healthCheck(),
      });
    } catch (err) {
      return reply.send({ error: err.message });
    }
  });

  /* ── System configuration status (quick overview) ── */
  app.get('/observation/config', async (request, reply) => {
    if (!await requireAdmin(request, reply)) return;
    try {
      const systemConfig = require('../services/systemConfigService');
      const configIntegration = require('../services/configIntegration');

      // Check what services are configured
      const emailConfig = await configIntegration.getEmailConfig();
      const stripeConfig = await configIntegration.getStripeConfig();
      const oauthConfig = await configIntegration.getOAuthConfig();
      const storageConfig = await configIntegration.getStorageConfig();
      const aiConfig = await configIntegration.getAIConfig();
      const streamingConfig = await configIntegration.getStreamingConfig();
      const kycConfig = await configIntegration.getKycConfig();

      return reply.send({
        configSource: await configIntegration.isConfigAvailable() ? 'database' : 'environment',
        services: {
          kyc: {
            configured: kycConfig.provider && kycConfig.provider !== 'none',
            provider: kycConfig.provider || 'none',
            stubMode: !kycConfig.provider || kycConfig.provider === 'none',
          },
          email: {
            configured: emailConfig.provider !== 'console',
            provider: emailConfig.provider,
          },
          payments: {
            stripe: !!stripeConfig.secretKey,
          },
          oauth: {
            google: !!oauthConfig.google.clientId,
            facebook: !!oauthConfig.facebook.clientId,
            apple: !!oauthConfig.apple.clientId,
            github: !!oauthConfig.github.clientId,
          },
          storage: {
            configured: storageConfig.provider !== 'local',
            provider: storageConfig.provider,
          },
          ai: {
            openai: !!aiConfig.openaiApiKey,
            anthropic: !!aiConfig.anthropicApiKey,
            hive: !!aiConfig.hiveApiKey,
          },
          streaming: {
            janus: !!streamingConfig.janusUrl,
          },
        },
      });
    } catch (err) {
      return reply.send({ error: err.message });
    }
  });
}

module.exports = { observationRoutes };
