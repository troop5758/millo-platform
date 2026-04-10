# Server / feed directory layout (canonical map)

**Production domain:** https://milloapp.com  

The tree below is the **logical** layout for the discovery feed stack. In the Millo monorepo, these map to existing packages so we keep a single source of truth (`@millo/database`, `@millo/discovery`) and **thin facades** under the API app.

## Target tree → repository paths

| Target path | Actual path |
|-------------|-------------|
| `server/models/userProfileFeatures.model.js` | `packages/api/src/server/models/userProfileFeatures.model.js` → `@millo/database` `UserProfileFeatures` |
| `server/models/contentFeatures.model.js` | `packages/api/src/server/models/contentFeatures.model.js` → `ContentFeatures` |
| `server/models/feedEvent.model.js` | `packages/api/src/server/models/feedEvent.model.js` → `FeedEvent` |
| `server/services/kafka.js` | `packages/api/src/server/services/kafka.js` |
| `server/services/redis.js` | `packages/api/src/server/services/redis.js` |
| `server/services/feedEvents.producer.js` | `packages/api/src/server/services/feedEvents.producer.js` → `packages/api/src/services/feedEvents.producer.js` |
| `server/services/feed/candidateGenerator.js` | `packages/api/src/server/services/feed/candidateGenerator.js` → `@millo/discovery` |
| `server/services/feed/policyFilter.js` | `…/policyFilter.js` → `@millo/discovery` |
| `server/services/feed/featureBuilder.js` | `…/featureBuilder.js` → `@millo/discovery` |
| `server/services/feed/ranker.js` | `…/ranker.js` → `@millo/discovery` `heuristicRanker` |
| `server/services/feed/postRanker.js` | `…/postRanker.js` → `@millo/discovery` |
| `server/services/feed/exploration.js` | `…/exploration.js` → `@millo/discovery` |
| `server/services/feed/sessionContext.js` | `…/sessionContext.js` → `@millo/discovery` |
| `server/services/feed/businessRules.js` | `…/businessRules.js` → `@millo/discovery` |
| `server/services/feed/vectorRetrieval.js` | `…/vectorRetrieval.js` → `packages/api/src/services/feed/vectorRetrieval.js` |
| `server/services/feed/feed.service.js` | `…/feed.service.js` → `@millo/discovery` `feedService` |
| `server/routes/feed.routes.js` | `packages/api/src/server/routes/feed.routes.js` → `packages/api/src/routes/feed.js` |
| `workers/rankTrainingSample.worker.js` | `packages/api/workers/rankTrainingSample.worker.js` → `packages/api/src/workers/rankTrainingSample.worker.js` |
| `web/src/hooks/useFeedTracking.js` | `packages/web/src/hooks/useFeedTracking.js` |

**Also used (not in your sketch):** `packages/api/src/services/experiments.js` (Part 18 A/B), `packages/api/src/services/kafkaEventBus.js`, `packages/api/src/routes/metrics.js`, POST **`/feed/events/*`** on the same Fastify app ([feed-reference-stack.md](./feed-reference-stack.md)).

**Registration:** Fastify still mounts routes from `packages/api/src/index.js` via `require('./routes/feed')` — the `feed.routes.js` facade is for imports that match the canonical tree.

---

*Millo 3.0 — directory equivalence for feed / discovery.*
