'use strict';
/**
 * Tracking support worker — verify ticket tracking via AfterShip, update SupportTicket, flag fraud if DELIVERED + NOT_DELIVERED.
 * https://milloapp.com
 */
const path = require('path');
const { Worker } = require('bullmq');
const { connection } = require('./queues');
const db = require('@millo/database');
const trackingService = require(path.resolve(__dirname, '../../api/src/services/tracking.service'));
const fraudService = require(path.resolve(__dirname, '../../api/src/services/fraudService'));

async function processTrackingJob(job) {
  const { ticketId } = job.data || {};
  if (!ticketId) return;

  const ticket = await db.SupportTicket.findById(ticketId);
  if (!ticket || !ticket.trackingNumber || !ticket.carrier) return;

  const { status } = await trackingService.verifyTracking(ticket.trackingNumber, ticket.carrier);
  ticket.trackingStatus = status;
  ticket.updatedAt = new Date();
  await ticket.save();

  if (status === 'DELIVERED' && ticket.issueType === 'NOT_DELIVERED') {
    await fraudService.flagSupportFraud(ticket.userId, 'POTENTIAL_FALSE_CLAIM', {
      supportTicketId: String(ticket._id),
      orderId: ticket.orderId ? String(ticket.orderId) : null,
      source: 'tracking_worker',
    });
  }

  return { ticketId, status };
}

const worker = new Worker(
  'tracking-support',
  async (job) => processTrackingJob(job),
  { connection }
);

worker.on('failed', (job, err) => {
  console.error('[tracking-support-worker] Job failed', job?.id, err?.message);
});

module.exports = { worker, processTrackingJob };
