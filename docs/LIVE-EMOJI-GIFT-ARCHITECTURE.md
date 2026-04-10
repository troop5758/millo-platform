# TikTok-Style LIVE Emoji + Gift System Architecture

Production-grade design for Millo. https://milloapp.com

## Overview

```
Viewer Client (React)
   │
   │ WebSocket (/live/ws?streamId=)
   ▼
Live WebSocket Gateway (Fastify WebSocket)
   │
   ├── Chat Service (liveChat.handleSendMessage)
   ├── Reaction Service (live_reaction → broadcast + Redis HINCRBY)
   ├── Gift Service (send_gift → economy.debit/credit)
   │
   ▼
Event Processors
   ├── Fraud Detection (fraudService, giftCooldown)
   ├── Analytics (LedgerEntry, fraudQueue)
   │
   ▼
Databases
   ├── MongoDB (StreamComment, LedgerEntry, etc.)
   ├── Redis (live:reactions:{streamId} — emoji counters)
   └── In-memory (reactionCooldown, giftCooldown)
```

## Reaction Service (Redis Aggregation)

Emojis are **not stored individually** in production. Instead they are aggregated in Redis (TikTok-style).

- **Redis key:** `live:reactions:{streamId}`
- **Value:** Hash `{ emoji: count }` (e.g. `🔥: 120`, `❤️: 340`)
- **Update:** `redis.hincrby('live:reactions:' + streamId, emoji, 1)`
- **TTL:** 24h per stream key

This allows **millions of reactions per minute** with O(1) atomic increments.

**API:** `GET /live/stream/:streamId/reactions` — returns `{ streamId, reactions: { '🔥': 120, '❤️': 340 } }`

## Client Layer (React)

### Emoji reaction event

```javascript
socket.send(JSON.stringify({
  type: 'live_reaction',
  data: {
    emoji: '🔥',
    timestamp: Date.now()
  }
}));
```

### Gift send event

```javascript
socket.send(JSON.stringify({
  type: 'send_gift',
  data: {
    gift_id: 'gift_rose',
    coins: 50,
    timestamp: Date.now(),
    fingerprint: deviceFingerprint,
    nonce: crypto.randomUUID()
  }
}));
```

**Note:** `streamId` and `senderId` are derived server-side from the WebSocket URL and auth token for security.

## Server Event Types

| Client → Server | Description |
|-----------------|-------------|
| `chat` / `send_message` | Chat message (persisted to StreamComment) |
| `live_reaction` | Emoji reaction (broadcast only, no persistence) |
| `send_gift` | Virtual gift (debit sender, credit creator) |
| `product_drop` | Creator drops product into stream |
| `start_auction` | Creator starts auction |

| Server → Client | Description |
|----------------|-------------|
| `chat` / `new_message` | Chat message |
| `live_reaction` | Emoji reaction from another viewer |
| `gift_sent` | Gift was sent successfully |
| `viewer_count` | Current viewer count |
| `product_drop` | Product dropped |
| `auction_started` | Auction started |

## Allowed Emojis (live_reaction)

Whitelist: 🔥 ❤️ 👍 😂 😮 😢 😡 🎉 👏 💯 ✨ 💪

## Rate Limits

- **Reactions:** 300ms cooldown per user
- **Gifts:** 2s cooldown per user
- **Chat:** 500 chars, standard rate limits

## Gift Flow

1. Client sends `send_gift` with gift_id, coins
2. Server validates: stream live, user auth, gift cost, fraud checks
3. Economy: debit sender, credit creator (80% share)
4. Broadcast `gift_sent` to room
5. Fraud queue processes for velocity/bot detection
