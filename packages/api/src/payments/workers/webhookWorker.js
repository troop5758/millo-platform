'use strict';
const { createWorker } = require('../queue');
const { PaymentOrchestrator } = require('../orchestrator');

const orchestrator = new PaymentOrchestrator();

function startWebhookWorker(log) {
  const logger = log || console;
  const worker = createWorker(async (job) => {
    const { provider, event } = job.data || {};
    await orchestrator.process(provider, event);
  });
  worker.on('failed', (job, err) => {
    logger.error?.({ err, jobId: job?.id }, 'payments webhook worker job failed');
  });
  return worker;
}

module.exports = { startWebhookWorker };
