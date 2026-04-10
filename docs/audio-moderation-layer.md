# Audio Moderation Layer

Prevent abusive audio uploads by scanning for **hate speech**, **adult content**, and other policy violations. Copyright detection is handled separately by the [Audio Fingerprint Protection](audio-fingerprint-protection.md) (copyrightScanService).

## Detection

- **Copyright** — Handled by copyright scan (AudD, ACRCloud, Pex) before this layer; see [audio-fingerprint-protection.md](audio-fingerprint-protection.md).
- **Hate speech** — Detected via transcript moderation (OpenAI) or audio-specific APIs (Hive, AssemblyAI).
- **Adult audio** — Sexual or inappropriate spoken content detected by all three providers.

## Providers

| Provider   | Use |
|-----------|-----|
| **OpenAI** | Whisper transcribes audio → Moderation API on transcript (hate, sexual, violence). |
| **Hive AI** | Speech moderation: audio URL or multipart file; returns classifications (sexual, hate, violence, bullying). |
| **AssemblyAI** | Upload audio → transcript with `content_safety: true`; returns content safety labels and severity. |

If more than one provider is configured, results are combined; the highest confidence drives the decision.

## Configuration

- **AI_AUDIO_MODERATION_ENABLED** — Set to `true` to enable. At least one provider key must be set.
- **AUDIO_MODERATION_BLOCK_THRESHOLD** — Confidence ≥ this → `block` (default `0.7`).
- **AUDIO_MODERATION_REVIEW_THRESHOLD** — Confidence ≥ this → `review` (default `0.4`). Both `block` and `review` result in upload being rejected (403).

### OpenAI

- **OPENAI_API_KEY** — Used for Whisper transcription and Moderation API on the transcript.
- Flow: buffer/URL → Whisper → text → Moderation API → category_scores (hate, sexual, violence).

### Hive AI

- **HIVE_API_KEY** — Required.
- **HIVE_API_URL** — Optional; default `https://api.thehive.ai/api/v2/task/sync`.
- For buffer: multipart form with `media` file. For URL: JSON body with `url`.
- Response: `status[0].response.output[0].classes` with class/score (sexual, hate, violence, bullying).

### AssemblyAI

- **ASSEMBLYAI_API_KEY** — Required.
- **ASSEMBLYAI_BASE_URL** — Optional; default `https://api.assemblyai.com`.
- Flow: upload file → `upload_url`; create transcript with `content_safety: true`; poll until completed; read `content_safety_labels.summary` and `content_safety_labels.results`.

## Where it runs

- **POST /music/upload** — After copyright scan, `audioModeration.scanAudio(buffer, mime)` runs. If `decision` is `block` or `review`, responds with 403.
- **POST /music** (create with `audioUrl`) — After copyright scan, `audioModeration.scanAudioByUrl(audioUrl)` runs. Same 403 behavior.

## API responses (block/review)

- **403 AUDIO_MODERATION_BLOCKED** — Content flagged (hate speech, adult, or other policy violation). Upload blocked.
- **403 AUDIO_MODERATION_REVIEW** — Content needs review before publishing. Upload blocked until approved.

Response body can include `reason` (e.g. `hate_speech`, `adult`) and `categories` (array of `{ category, score }`).

## Service

- **Package:** `packages/api/src/services/audioModerationService.js`
- **Exports:** `isConfigured()`, `scanAudio(buffer, contentType)`, `scanAudioByUrl(url)`.
- **Return shape:** `{ flagged, decision: 'allow'|'block'|'review', reason?, provider?, categories?, confidence? }`.

If no provider is configured or all scans fail, the service returns `decision: 'allow'` so uploads are not blocked by moderation.
