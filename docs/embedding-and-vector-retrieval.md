# Embeddings & vector retrieval (Millo discovery)

**Domain:** https://milloapp.com

## First deployable version (no ANN service)

Signals already modeled in Mongo:

| Signal | Where |
|--------|--------|
| Topic affinities | `UserProfileFeatures.categoryAffinityTop`, `ContentFeatures.topics` |
| Creator affinities | `UserProfileFeatures.creatorAffinityTop`, `ContentFeatures.creatorId` |
| Language | `UserProfileFeatures.language`, `ContentFeatures.language` |
| Region | `UserProfileFeatures.country`, `ContentFeatures.region` |
| Watch / engagement windows | `UserProfileFeatures` rates (`avgWatchTime7d`, `shortSkipRate7d`, …), `ContentFeatures` aggregates |

**Retrieval without a vector DB:** `packages/discovery/src/candidateGenerator.js` — `getEmbeddingCandidates(userProfile, limit)` (topic overlap + engagement sort).  

**API helper:** `packages/api/src/services/feed/vectorRetrieval.js` — `nearestContentForUser(userId, limit)` uses Mongo fallback when no ANN backend is registered.

## Better version (dense vectors)

Produce embeddings from:

- Text captions (multilingual text encoder)
- Hashtags (bag + hash embedding or same encoder)
- Audio clusters (music / speech representation)
- Visual frames (image/video encoder)
- User sequence history (session model → user vector)

Store in:

- `UserProfileFeatures.embedding: number[]`
- `ContentFeatures.embedding: number[]`

Publish updates on Kafka `feature.user.updates` / `feature.content.updates` (see pipeline doc).

## Vector retrieval interface

**File:** `packages/api/src/services/feed/vectorRetrieval.js`

| Export | Role |
|--------|------|
| `registerVectorRetrievalBackend({ nearestByEmbedding })` | Inject pgvector / Qdrant / Milvus / Weaviate client |
| `nearestContentByUserEmbedding(vector, limit, opts?)` | ANN query; returns `[]` until backend registered |
| `nearestContentForUser(userId, limit)` | Uses registered ANN if `profile.embedding` present; else Mongo topic path |
| `buildStubEmbeddingFromProfile(profile, dim?)` | Deterministic stub (not semantic) for tests / placeholders |
| `getConfiguredBackendName()` | Reads `VECTOR_RETRIEVAL_BACKEND` |

## Recommended production backends

| Backend | When to use |
|---------|-------------|
| **pgvector** | Easiest rollout if you already use Postgres; single stack |
| **Qdrant** | Dedicated ANN, good ops / filtering story |
| **Milvus** | Very large scale, heavy vector workloads |

Implement `nearestByEmbedding(vector, limit, opts)` in your connector and call `registerVectorRetrievalBackend` at API startup (behind env).

## Related

- [discovery-recommendation-pipeline.md](./discovery-recommendation-pipeline.md) — full feed pipeline
- [phase-2-database-schemas.md](./phase-2-database-schemas.md) — `UserProfileFeatures`, `ContentFeatures`
