'use strict';
/**
 * Support ticket service — tracking ID, SLA defaults, auto-assignment engine.
 * Assignment: random (assign to random available agent) or least_busy (fewest open tickets).
 * https://milloapp.com
 */
const db = require('@millo/database');
const { generateTrackingId } = require('../lib/generateTrackingId');

/** Response SLA: minutes (default 30). */
const SLA_RESPOND_MINUTES = Number(process.env.SUPPORT_SLA_RESPOND_MINUTES) || 30;
/** Resolution SLA: hours (default 24). */
const SLA_RESOLVE_HOURS = Number(process.env.SUPPORT_SLA_RESOLVE_HOURS) || 24;
/** Assignment strategy: "random" | "least_busy". */
const ASSIGNMENT_STRATEGY = (process.env.SUPPORT_ASSIGNMENT_STRATEGY || 'random').toLowerCase();

/**
 * Generate tracking ID: MIL-{Date.now()}-{random6}. No DB counter.
 */
function generateTicketNumber() {
  return generateTrackingId();
}

/**
 * SLA defaults. Returns flat (slaRespondBy, slaResolveBy) and nested (sla.responseDue, sla.resolutionDue).
 */
function getSlaDefaults() {
  const now = new Date();
  const slaRespondBy = new Date(now.getTime() + SLA_RESPOND_MINUTES * 60 * 1000);
  const slaResolveBy = new Date(now.getTime() + SLA_RESOLVE_HOURS * 60 * 60 * 1000);
  return {
    slaRespondBy,
    slaResolveBy,
    sla: {
      responseDue: slaRespondBy,
      resolutionDue: slaResolveBy,
    },
  };
}

/**
 * Get available support agents (role support, status active). Equivalent to isActive: true.
 */
async function getAvailableAgents() {
  return db.User.find(
    { role: 'support', status: 'active' },
    { _id: 1, email: 1 }
  ).lean();
}

/**
 * Pick one agent by strategy: random (round-robin style) or least_busy (fewest open tickets).
 * @param {Array<{ _id: ObjectId }>} agents
 * @param {string} [ticketId] - optional, for least_busy count
 * @returns {Object|null} agent or null
 */
async function pickAgent(agents, ticketId) {
  if (!agents || agents.length === 0) return null;
  if (ASSIGNMENT_STRATEGY === 'least_busy') {
    const openStatuses = ['OPEN', 'IN_REVIEW', 'assigned', 'in_progress'];
    const counts = await Promise.all(
      agents.map(async (a) => {
        const n = await db.SupportTicket.countDocuments({
          assignedTo: a._id,
          status: { $in: openStatuses },
          ...(ticketId ? { _id: { $ne: ticketId } } : {}),
        });
        return { agent: a, count: n };
      })
    );
    counts.sort((a, b) => a.count - b.count);
    return counts[0].agent;
  }
  return agents[Math.floor(Math.random() * agents.length)];
}

/**
 * Assign ticket to an available agent. Updates ticket.assignedTo, assignedAt, status = "assigned".
 * @param {Object|string} ticketOrId - SupportTicket document or _id
 * @returns {{ agent: object, ticket: object }|null} agent and updated ticket, or null if no agents
 */
async function assignTicket(ticketOrId) {
  const agents = await getAvailableAgents();
  if (!agents.length) return null;

  const ticketId = ticketOrId && (ticketOrId._id || ticketOrId);
  const agent = await pickAgent(agents, ticketId);
  if (!agent) return null;

  const update = {
    assignedTo: agent._id,
    assignedAt: new Date(),
    status: 'assigned',
  };

  const ticket = await db.SupportTicket.findByIdAndUpdate(
    ticketId,
    { $set: update },
    { new: true }
  ).lean();

  if (!ticket) return null;
  return { agent, ticket };
}

/**
 * Assign ticket to an available agent (convenience). Returns updated ticket or null.
 * Used on ticket create; keeps backward-compat return shape.
 */
async function assignAgentToTicket(ticketId) {
  const result = await assignTicket(ticketId);
  return result ? result.ticket : null;
}

/**
 * Get list of support agent userIds (for real-time push). Excludes suspended.
 */
async function getSupportAgentIds() {
  const users = await db.User.find(
    { role: 'support', status: 'active' },
    { _id: 1 }
  ).lean();
  return users.map((u) => String(u._id));
}

module.exports = {
  generateTicketNumber,
  getSlaDefaults,
  assignTicket,
  assignAgentToTicket,
  getAvailableAgents,
  pickAgent,
  getSupportAgentIds,
  generateTrackingId,
  SLA_RESPOND_MINUTES,
  SLA_RESOLVE_HOURS,
  ASSIGNMENT_STRATEGY,
};
