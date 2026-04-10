'use strict';
/**
 * SLA monitoring — find tickets past response/resolution due and escalate.
 * Used by cron job / worker. https://milloapp.com
 */
const db = require('@millo/database');
const notifyUser = require('../lib/notifyUser');

/** Statuses that count as "awaiting first response" for response-Due breach */
const AWAITING_RESPONSE_STATUSES = ['open', 'assigned', 'OPEN', 'IN_REVIEW'];
/** Statuses that count as "not resolved" for resolution-Due breach */
const UNRESOLVED_STATUSES = ['open', 'assigned', 'in_progress', 'OPEN', 'IN_REVIEW'];

/**
 * Find tickets where sla.responseDue (or slaRespondBy) is past and status is open/assigned.
 * Escalate: set slaResponseBreachedAt, log, optionally notify admins.
 * @param {{ log?: object, notifyAdmins?: boolean }} opts
 * @returns {{ responseBreached: number, resolutionBreached: number, escalated: object[] }}
 */
async function checkSLA(opts = {}) {
  const now = new Date();
  const log = opts.log || console;
  const notifyAdmins = opts.notifyAdmins !== false;

  const result = { responseBreached: 0, resolutionBreached: 0, escalated: [] };

  try {
    // Response due breached: (sla.responseDue < now OR slaRespondBy < now), status in open/assigned, not yet escalated
    const responseDueQuery = {
      status: { $in: AWAITING_RESPONSE_STATUSES },
      $or: [
        { 'sla.responseDue': { $lt: now } },
        { slaRespondBy: { $lt: now } },
      ],
      slaResponseBreachedAt: null,
    };

    const overdueResponse = await db.SupportTicket.find(responseDueQuery).lean();

    for (const ticket of overdueResponse) {
      await db.SupportTicket.updateOne(
        { _id: ticket._id },
        { $set: { slaResponseBreachedAt: now } }
      );
      result.responseBreached++;
      result.escalated.push({
        ticketId: String(ticket._id),
        trackingId: ticket.trackingId || ticket.ticketNumber,
        type: 'response_due',
      });
      log.warn?.({ ticketId: ticket._id, trackingId: ticket.trackingId || ticket.ticketNumber }, 'SLA breached: response due');
      if (process.env.NODE_ENV !== 'test') {
        log.info?.(`SLA breached (response due): ${ticket.trackingId || ticket.ticketNumber}`);
      }
    }

    // Resolution due breached: (sla.resolutionDue < now OR slaResolveBy < now), status not resolved/closed, not yet escalated
    const resolutionDueQuery = {
      status: { $in: UNRESOLVED_STATUSES },
      $or: [
        { 'sla.resolutionDue': { $lt: now } },
        { slaResolveBy: { $lt: now } },
      ],
      slaResolutionBreachedAt: null,
    };

    const overdueResolution = await db.SupportTicket.find(resolutionDueQuery).lean();

    for (const ticket of overdueResolution) {
      await db.SupportTicket.updateOne(
        { _id: ticket._id },
        { $set: { slaResolutionBreachedAt: now } }
      );
      result.resolutionBreached++;
      result.escalated.push({
        ticketId: String(ticket._id),
        trackingId: ticket.trackingId || ticket.ticketNumber,
        type: 'resolution_due',
      });
      log.warn?.({ ticketId: ticket._id, trackingId: ticket.trackingId || ticket.ticketNumber }, 'SLA breached: resolution due');
      if (process.env.NODE_ENV !== 'test') {
        log.info?.(`SLA breached (resolution due): ${ticket.trackingId || ticket.ticketNumber}`);
      }
    }

    if (notifyAdmins && result.escalated.length > 0) {
      const adminIds = await db.User.find({ role: 'admin', status: 'active' }).select('_id').lean();
      const summary = `${result.responseBreached} response due, ${result.resolutionBreached} resolution due`;
      for (const admin of adminIds) {
        try {
          await notifyUser(admin._id, {
            type: 'support_sla_breach',
            title: 'SLA breach',
            body: summary,
            meta: { count: result.escalated.length, escalated: result.escalated },
          });
        } catch (_) {}
      }
    }

    return result;
  } catch (e) {
    log.error?.(e, 'slaMonitor checkSLA error');
    throw e;
  }
}

module.exports = { checkSLA };
