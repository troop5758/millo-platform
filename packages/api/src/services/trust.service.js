'use strict';
/**
 * Trust graph facade — reputation score + heterogeneous graph edges (Mongo + optional Neo4j).
 *
 * Nodes: user | device | ip | payment_method
 * Edges: USES | CONNECTED_TO | TRANSACTS_WITH
 *
 * Storage: `TrustGraphLink` (MongoDB). When `NEO4J_URI` is set, `USES` (user→device, user→ip) and
 * `TRANSACTS_WITH` (user→payment_method) dual-write via `neo4jClusterService` (USES_DEVICE, USES_IP, TRANSACTED).
 * https://milloapp.com
 */

const db = require('@millo/database');

const NODE_KIND = Object.freeze({
  USER: 'user',
  DEVICE: 'device',
  IP: 'ip',
  PAYMENT_METHOD: 'payment_method',
});

const EDGE_TYPE = Object.freeze({
  USES: 'USES',
  CONNECTED_TO: 'CONNECTED_TO',
  TRANSACTS_WITH: 'TRANSACTS_WITH',
});

/**
 * @param {{ strikes?: number, verified?: boolean, fraudFlags?: number }} user
 * @returns {number} 0–100
 */
function calculateTrust(user = {}) {
  let score = 100;
  const strikes = Number(user.strikes) || 0;
  const fraudFlags = Number(user.fraudFlags) || 0;
  score -= strikes * 10;
  score += user.verified ? 20 : 0;
  score -= fraudFlags * 25;
  return Math.max(0, Math.min(100, score));
}

/**
 * @param {string | { kind: string, id: string }} ref
 * @param {string} [fallbackKind]
 * @returns {{ kind: string, id: string } | null}
 */
function normalizeNode(ref, fallbackKind) {
  if (ref == null) return null;
  if (typeof ref === 'object' && ref.kind && ref.id != null) {
    return { kind: String(ref.kind).toLowerCase(), id: String(ref.id) };
  }
  if (typeof ref === 'string' && fallbackKind) {
    return { kind: String(fallbackKind).toLowerCase(), id: ref };
  }
  return null;
}

/**
 * @param {object} params
 * @param {string|object} [params.from] — `{ kind, id }` or string id with `fromKind`
 * @param {string|object} [params.to] — `{ kind, id }` or string id with `toKind`
 * @param {string} params.type — USES | CONNECTED_TO | TRANSACTS_WITH
 * @param {string} [params.fromKind] [params.toKind]
 * @param {string} [params.userId] [params.deviceId] shorthand for USES user→device
 * @param {object} [params.meta]
 */
async function createEdge(params = {}) {
  const rawType = params.type || params.edgeType;
  if (!rawType) throw new Error('TRUST_GRAPH_EDGE_INVALID');

  const edgeType = String(rawType).toUpperCase();
  if (!Object.values(EDGE_TYPE).includes(edgeType)) {
    throw new Error('TRUST_GRAPH_EDGE_INVALID');
  }

  let fromNode;
  let toNode;

  if (params.userId != null && params.deviceId != null && edgeType === EDGE_TYPE.USES) {
    fromNode = { kind: NODE_KIND.USER, id: String(params.userId) };
    toNode = { kind: NODE_KIND.DEVICE, id: String(params.deviceId) };
  } else if (
    edgeType === EDGE_TYPE.USES
    && typeof params.from === 'string'
    && typeof params.to === 'string'
    && params.fromKind == null
    && params.toKind == null
  ) {
    // Shorthand: two string ids → User USES Device (common ingest path)
    fromNode = { kind: NODE_KIND.USER, id: params.from };
    toNode = { kind: NODE_KIND.DEVICE, id: params.to };
  } else {
    fromNode =
      normalizeNode(params.from, params.fromKind)
      || (params.fromKind && params.from != null
        ? { kind: String(params.fromKind).toLowerCase(), id: String(params.from) }
        : null);
    toNode =
      normalizeNode(params.to, params.toKind)
      || (params.toKind && params.to != null
        ? { kind: String(params.toKind).toLowerCase(), id: String(params.to) }
        : null);
  }

  if (!fromNode || !toNode) {
    throw new Error('TRUST_GRAPH_EDGE_INVALID');
  }

  const meta = params.meta && typeof params.meta === 'object' ? { ...params.meta } : {};
  meta.lastSeenAt = new Date();

  const filter = {
    fromKind: fromNode.kind,
    fromId: fromNode.id,
    toKind: toNode.kind,
    toId: toNode.id,
    edgeType,
  };

  const weightInsert = params.weight != null && Number.isFinite(Number(params.weight))
    ? Number(params.weight)
    : 1;

  const doc = await db.TrustGraphLink.findOneAndUpdate(
    filter,
    {
      $set: { meta },
      $setOnInsert: {
        ...filter,
        weight: weightInsert,
      },
    },
    { upsert: true, new: true }
  );

  await dualWriteNeo4j(fromNode, toNode, edgeType, params.meta || {});

  return { ok: true, id: doc._id, from: fromNode, to: toNode, edgeType };
}

async function dualWriteNeo4j(fromNode, toNode, edgeType, meta) {
  let neo4j;
  try {
    neo4j = require('./neo4jClusterService');
  } catch {
    return;
  }
  if (!neo4j.isEnabled()) return;

  try {
    if (edgeType === EDGE_TYPE.USES && fromNode.kind === NODE_KIND.USER && toNode.kind === NODE_KIND.DEVICE) {
      await neo4j.linkUserDevice(fromNode.id, toNode.id, meta);
    } else if (edgeType === EDGE_TYPE.USES && fromNode.kind === NODE_KIND.USER && toNode.kind === NODE_KIND.IP) {
      await neo4j.linkUserIP(fromNode.id, toNode.id, meta);
    } else if (
      edgeType === EDGE_TYPE.TRANSACTS_WITH
      && fromNode.kind === NODE_KIND.USER
      && toNode.kind === NODE_KIND.PAYMENT_METHOD
    ) {
      await neo4j.linkPayment(fromNode.id, toNode.id, {
        amount: meta.amountCents != null ? meta.amountCents / 100 : meta.amount || 0,
        currency: meta.currency || 'USD',
      });
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[trust.service] neo4j dual-write skipped:', err?.message);
    }
  }
}

/** TikTok-style `graph.createEdge({ from, to, type })` — `from`/`to` may be string ids with kinds in options. */
const graph = {
  createEdge: (opts) => createEdge(opts),
};

module.exports = {
  NODE_KIND,
  EDGE_TYPE,
  calculateTrust,
  createEdge,
  graph,
};
