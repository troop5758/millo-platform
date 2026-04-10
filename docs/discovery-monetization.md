# Discovery & Monetization — Subscription Products & Filter Version Pinning

## 1. Subscription product CRUD

Subscription products are creator-defined subscription tiers, backed by the `SubscriptionTier` collection. The API exposes them with the schema: `creatorId`, `tierName`, `price`, `benefits`.

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/subscriptions/products` | Creator or Admin | Create a subscription product |
| GET | `/subscriptions/products` | None | List products (optional `?creatorId=`) |
| GET | `/subscriptions/products/:id` | None | Get one product by ID |
| PATCH | `/subscriptions/products/:id` | Creator or Admin | Update product |
| DELETE | `/subscriptions/products/:id` | Creator or Admin | Delete product |

### Schema (request/response)

- **creatorId** (ObjectId) — creator who owns the tier
- **tierName** (String) — display name (e.g. "Pro")
- **price** (Number) — price in currency units (e.g. 9.99); stored as `priceMonthlyCents` internally
- **benefits** ([String]) — list of benefit descriptions; stored as `features` in SubscriptionTier

### POST body example

```json
{
  "creatorId": "507f1f77bcf86cd799439011",
  "tierName": "Pro",
  "price": 9.99,
  "benefits": ["Exclusive content", "Early access", "DM access"]
}
```

### Response shape (single product)

```json
{
  "id": "...",
  "creatorId": "...",
  "tierName": "Pro",
  "tierId": "pro",
  "price": 9.99,
  "priceMonthlyCents": 999,
  "benefits": ["Exclusive content", "Early access"],
  "active": true,
  "sortOrder": 0,
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

## 2. Filter version pinning (discovery models)

Allows testing new recommendation models by pinning a **model version** and **rollout percentage**. Stored in the `discovery_models` collection.

### Collection: discovery_models

| Field | Type | Description |
|-------|------|-------------|
| modelId | String | Unique identifier (e.g. `feed`, `trending`) |
| modelVersion | String | Version tag (e.g. `v3`) |
| rollout | Number | Percentage 0–100 of traffic to use this version |
| meta | Object | Optional metadata |

Example document:

```json
{
  "modelId": "feed",
  "modelVersion": "v3",
  "rollout": 20
}
```

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/discovery/models` | None | List all discovery models (version + rollout) |
| GET | `/discovery/models/:modelId` | None | Get one model |
| PATCH | `/admin/discovery/models/:modelId` | Admin | Set modelVersion and/or rollout (upsert) |

### PATCH body example

```json
{
  "modelVersion": "v3",
  "rollout": 20
}
```

Recommendation services can read `GET /discovery/models` to decide which model version to use and what percentage of users receive it.
