# Mobile / Web AI System — Milla

## 1. Milla AI Chat API

**POST /ai/chat**

Request body (Milla API shape):

- **prompt** (string) — user message (alias: `message`)
- **context** (string, optional) — system/context for the model (alias: `systemPrompt`)
- **userId** (string, optional) — override user id; defaults to authenticated user
- **streamId**, **model** (optional) — passed through to `milla.generateReply`

Response: `{ ok: true, reply: { role, content }, userId }`

Example:

```json
POST /ai/chat
{ "prompt": "What can you do?", "context": "You are Milla, the platform assistant." }
```

## 2. Milla moderation wrapper

**Service:** `services/millaModeration.js`

Unified moderation for:

- **Chat** — `millaModeration.moderateChat(text)`
- **Comments** — `millaModeration.moderateComment(text)`
- **Livestream text** — `millaModeration.moderateLivestreamText(text)`

Each returns: `{ allowed, decision, flagged, confidence, categories, source?, queued? }`.  
`allowed === false` when `decision === 'block'`. Uses the existing AI moderation pipeline (OpenAI + rule-based abuse); when AI is disabled, returns `allowed: true` and `source: 'none'`.

**Integration:** Livestream chat `POST /live/stream/:streamId/chat` runs `moderateLivestreamText` when `millaModeration.isEnabled()` is true and rejects with `CONTENT_BLOCKED` if not allowed.

## 3. AI voice assistant — voice command hooks

**POST /ai/milla/voice-command**

Request: `{ "command": "..." }` or `{ "text": "..." }`  
Auth: required.

Parses natural language into intents, e.g.:

- "ban user" / "kick user" → **ban_user**
- "start stream" / "go live" → **start_stream**
- "add moderator" / "make them mod" → **add_moderator**

Response: `{ ok: true, intent, params, acknowledged, raw }`  
`acknowledged === true` when intent was recognized.

Example:

```json
POST /ai/milla/voice-command
{ "command": "ban user" }
→ { "ok": true, "intent": "ban_user", "params": {}, "acknowledged": true, "raw": "ban user" }
```

Execution of intents (e.g. actually banning a user) is not implemented in this hook; the API returns the parsed intent and params for the client or downstream services to act on.
