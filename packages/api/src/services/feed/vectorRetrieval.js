'use strict';
/**
 * Vector ANN retrieval — interface for pgvector / Qdrant / Milvus / Weaviate.
 *
 * **First deployable (no ANN):** topic/creator/language/region + watch windows live in
 * `UserProfileFeatures` / `ContentFeatures`; use `nearestContentForUser()` which falls back to
 * Mongo topic overlap (`getEmbeddingCandidates`) when no backend is registered.
 *
 * **Better version:** dense vectors from captions, hashtags, audio clusters, visual embeddings,
 * user sequence models — store in `UserProfileFeatures.embedding` / `ContentFeatures.embedding`
 * and register a backend that implements `nearestByEmbedding`.
 *
 * **Production:** pgvector (Postgres) for easy rollout; Qdrant for dedicated ANN; Milvus at very large scale.
 *
 * Env: `VECTOR_RETRIEVAL_BACKEND` — `none` | `pgvector` | `qdrant` | `milvus` | `weaviate` (informational until wired).
 * https://milloapp.com
 */

/** @typedef {{ contentId: string, score?: number, distance?: number, meta?: object }} VectorSearchHit */
/** @typedef {{ nearestByEmbedding?: (vector: number[], limit: number, opts?: object) => Promise<VectorSearchHit[]|object[]> }} VectorRetrievalBackend */

let _backend = /** @type {VectorRetrievalBackend|null} */ (null);

/**
 * Inject ANN implementation (e.g. from bootstrap). Not used until you wire a client.
 * @param {VectorRetrievalBackend|null} impl
 */
function registerVectorRetrievalBackend(impl) {
  _backend = impl && typeof impl === 'object' ? impl : null;
}

function getConfiguredBackendName() {
  return (process.env.VECTOR_RETRIEVAL_BACKEND || 'none').toLowerCase().trim();
}

/**
 * ANN search by user/content embedding vector.
 * @param {number[]} userEmbedding
 * @param {number} [limit]
 * @param {object} [opts] - e.g. { filters: { language } } — backend-specific
 * @returns {Promise<VectorSearchHit[]>}
 */
async function nearestContentByUserEmbedding(userEmbedding, limit = 100, opts = {}) {
  const vec = Array.isArray(userEmbedding) ? userEmbedding : [];
  if (typeof _backend?.nearestByEmbedding === 'function') {
    return _backend.nearestByEmbedding(vec, limit, opts);
  }
  void getConfiguredBackendName();
  return [];
}

/**
 * First-deployable path: if `profile.embedding` is non-empty, call ANN when registered;
 * otherwise Mongo topic overlap (same family as discovery `getEmbeddingCandidates`).
 * @param {string} userId
 * @param {number} [limit]
 * @returns {Promise<object[]>} ContentFeatures-shaped lean docs or hits from backend
 */
async function nearestContentForUser(userId, limit = 100) {
  const uid = String(userId);
  const db = require('@millo/database');
  const profile = await db.UserProfileFeatures.findOne({ userId: uid }).lean();

  if (!profile) return [];

  const emb = profile.embedding;
  if (Array.isArray(emb) && emb.length > 0 && typeof _backend?.nearestByEmbedding === 'function') {
    return _backend.nearestByEmbedding(emb.map(Number).filter((n) => Number.isFinite(n)), limit, {
      userId: uid,
    });
  }

  const discovery = require('@millo/discovery');
  const { getEmbeddingCandidates } = discovery.candidateGenerator;
  if (typeof getEmbeddingCandidates === 'function') {
    return getEmbeddingCandidates(profile, limit);
  }
  return [];
}

/**
 * Deterministic low-dimensional stub from affinities (not a semantic embedding — for tests / placeholders).
 * @param {object|null|undefined} profile - UserProfileFeatures lean
 * @param {number} [dim] default 64
 * @returns {number[]}
 */
function buildStubEmbeddingFromProfile(profile, dim = 64) {
  const out = new Array(dim).fill(0);
  if (!profile || typeof profile !== 'object') return out;
  const topics = profile.categoryAffinityTop || [];
  const creators = profile.creatorAffinityTop || [];
  const hash = (s) => {
    let h = 0;
    const str = String(s);
    for (let i = 0; i < str.length; i++) {
      h = (h * 31 + str.charCodeAt(i)) >>> 0;
    }
    return h % dim;
  };
  for (const t of topics) {
    const i = hash(`t:${t}`);
    out[i] += 0.15;
  }
  for (const c of creators) {
    const i = hash(`c:${c}`);
    out[i] += 0.2;
  }
  if (profile.language) {
    out[hash(`lang:${profile.language}`)] += 0.1;
  }
  if (profile.country) {
    out[hash(`reg:${profile.country}`)] += 0.1;
  }
  return out;
}

module.exports = {
  registerVectorRetrievalBackend,
  getConfiguredBackendName,
  nearestContentByUserEmbedding,
  nearestContentForUser,
  buildStubEmbeddingFromProfile,
};
