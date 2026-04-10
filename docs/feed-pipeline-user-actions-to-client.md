# Feed pipeline — user actions → client

**Production:** https://milloapp.com

End-to-end data path from implicit/explicit user signals to infinite-scroll delivery.

```
User Actions (views, likes, watch time, follows)
        ↓
Kafka Event Stream
        ↓
Feature Extraction Pipeline
        ↓
User Profile + Content Embeddings
        ↓
Ranking Engine (Real-Time API)
        ↓
Feed API (/feed)
        ↓
Client (Infinite scroll)
```

---

## Mapping to Millo (this repo)

| Stage | What happens | Where |
|-------|----------------|-------|
| **User actions** | Impressions, watch milestones, likes, follows, negative signals | Client → **`POST /feed/events/*`** (`packages/api/src/routes/feed.js`); also product analytics elsewhere |
| **Kafka event stream** | Durable fan-out for training + online features | **`feed.impression`**, **`feed.watch`**, **`feed.engagement`**, **`feed.negative`** (`kafkaEventBus.TOPICS`); optional **`rank.predictions`**, **`feature.user.updates`**, **`rank.train.samples`** |
| **Feature extraction** | Build user/content features, session boosts | **`packages/workers/features.worker.js`** (Kafka `user_events` → aggregates → optional `feature.content.updates`); **`@millo/discovery`** — `featureBuilder`, `UserProfileFeatures` (see `discovery-recommendation-pipeline.md`) |
| **User profile + embeddings** | Stored features + optional vector retrieval | **`packages/api/src/services/profile.service.js`** `buildUserProfile(events)`; Mongo `UserProfileFeatures`, **`FEATURE_USER_UPDATES`** / **`FEATURE_CONTENT_UPDATES`** |
| **Content embeddings** | Represent videos/items numerically | **`packages/api/src/services/contentEmbedding.service.js`** — Phase 1: `buildContentVector`; Phase 2+: `buildDenseContentEmbedding`, `ContentFeatures.embedding`, **`feed/vectorRetrieval.js`**, Weaviate / Pinecone / Qdrant / pgvector |
| **Ranking engine** | Score, rerank, diversity, business rules | **Production:** `packages/discovery` (`rankingEngine`, `feed.service`, `policyFilter`, experiments). **Simplified core:** `packages/api/src/services/ranking.service.js` (`scoreVideo`, `rankFeed`) for tests / teaching |
| **Feed API** | Auth, blocks, pagination, response shape | **`GET /feed/for-you`** (canonical For You); **`GET /feed/realtime`** (opt-in simple ranker + `ranking.service`); **`GET /content/feed`** in `content.js` |
| **Client** | Fetch next page, emit events | **`useForYouFeed`**, **`useFeedTracking`**, `packages/web/src/sdk/contentApi.js` |

---

## API quick reference

- **For You:** `GET /feed/for-you?limit=&cursor=` — Bearer auth; `FEED_FOR_YOU_ENABLED=false` → 503.
- **Events:** `POST /feed/events/impression|watch|engagement|negative` — `FEED_EVENTS_ENABLED=false` → 503.

Full HTTP table: **`docs/feed-reference-stack.md`**.

---

## Deeper architecture

- Full staged pipeline (candidates → safety → rank A/B → diversity): **`docs/discovery-recommendation-pipeline.md`**
- Kafka topics CRD examples: **`infra/k8s/kafka-topics-recommendation-pipeline.yaml`**
