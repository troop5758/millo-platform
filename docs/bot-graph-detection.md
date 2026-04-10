# Graph Analysis (Bot Farm Detection)

Bot farms operate in **coordinated clusters**. This service detects clusters using device, IP, same-day signup, and interaction patterns (e.g. A likes B, B likes C, C likes A in rapid succession).

## Detection signals

| Signal | Description |
|--------|-------------|
| **Accounts created same day** | Many users with same `createdAt` calendar day |
| **Same device fingerprint** | Many accounts sharing one or more device fingerprints |
| **Same IP** | Many accounts sharing IP (from `DeviceFingerprint.ip`) |
| **Rapid interactions** | Follows/likes with &lt; 5s between consecutive actions (e.g. 50+ such pairs) |
| **Mutual in-cluster** | High share of user’s interactions are with users in the same device cluster |

## Network detection (example)

Repeated mutual patterns (A likes B, B likes C, C likes A) are surfaced by:

- **Rapid interactions:** many actions with gap &lt; 5s → automated behavior.
- **In-cluster ratio:** most interactions with users who share the same device/IP → coordinated cluster.

## Service

**`packages/api/src/services/botGraphDetection.js`**

- **`detectBotCluster(userId)`** → `{ isBotCluster, signals, rapidCount, deviceClusterSize, ipClusterSize, sameDayCount, inClusterRatio }`
- **`getInteractionsForUser(userId)`** — follows + likes (likes resolved to stream owner)
- **`detectRapidInteractions(userId)`** — true if 50+ consecutive interactions &lt; 5s apart
- **`getRapidInteractionCount(userId)`** — count of such rapid pairs
- **`getClusterByDevice(userId)`** — user IDs sharing a fingerprint with this user
- **`getClusterByIP(userId)`** — user IDs sharing an IP with this user
- **`getClusterBySameDay(userId, maxUsers)`** — user IDs created the same calendar day
- **`getInClusterInteractionRatio(userId)`** — proportion of interactions with device-cluster members

**Cluster logic:** `isBotCluster` is true when:

- At least 2 of the above signals fire, or
- Rapid interactions + (device or IP cluster ≥ 1), or
- Device cluster ≥ 10 or IP cluster ≥ 10

## Config (env)

- `BOT_GRAPH_RAPID_GAP_MS` — max gap between consecutive actions to count as rapid (default 5000)
- `BOT_GRAPH_RAPID_COUNT_THRESHOLD` — min number of rapid pairs to flag (default 50)
- `BOT_GRAPH_CLUSTER_SIZE_THRESHOLD` — min cluster size to emit same_device/same_ip/same_day signal (default 3)

## API (admin)

- **GET /dashboards/admin/bot-cluster/:userId** — full `detectBotCluster` result. Admin only.
- **GET /admin/bot-cluster/:userId** — same. Admin only.

## Risk engine integration

`riskEngine.calculateRisk(userId)` calls `detectBotCluster`; if `isBotCluster` it adds **+25** and the signal **`bot_cluster`** to the user’s risk score.

## References

- [anti-bot-system-architecture.md](anti-bot-system-architecture.md) — Detection Layer (Graph analysis)
- [bot-risk-scoring-engine.md](bot-risk-scoring-engine.md) — Risk score and signals
- `packages/api/src/services/botGraphDetection.js`
- `packages/api/src/routes/dashboards.js` — admin bot-cluster routes
