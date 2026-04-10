'use strict';
/**
 * Content vectors — represent items for discovery / ANN (Phase 1: symbolic; Phase 2+: dense embeddings).
 *
 * Phase 1: `buildContentVector` — category + tags (no ML). Persist via `ContentFeatures` or Kafka
 * `feature.content.updates` for downstream jobs.
 *
 * Phase 2+: dense vectors (OpenAI / multimodal models), store in `ContentFeatures.embedding` (Mongo),
 * query via `packages/api/src/services/feed/vectorRetrieval.js` + Vector DB (Weaviate / Pinecone / Qdrant / pgvector).
 * https://milloapp.com
 */

/**
 * Phase 1 — lightweight symbolic vector (no model inference).
 * @param {{ category?: string, tags?: string[] }} video — or any content-shaped object with `category` / `tags`
 * @returns {{ category: string | null, tags: string[] }}
 */
function buildContentVector(video) {
  if (!video || typeof video !== 'object') {
    return { category: null, tags: [] };
  }
  const category = video.category != null ? String(video.category) : null;
  const tags = Array.isArray(video.tags)
    ? video.tags.map((t) => String(t)).filter(Boolean)
    : [];
  return { category, tags };
}

/**
 * Phase 2+ placeholder — replace with provider call (e.g. OpenAI embeddings API) and write to `ContentFeatures.embedding`.
 * @returns {Promise<number[]|null>}
 */
async function buildDenseContentEmbedding() {
  return null;
}

module.exports = {
  buildContentVector,
  buildDenseContentEmbedding,
};
