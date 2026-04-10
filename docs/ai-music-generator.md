# AI Music Generator (Future Feature)

Platforms can generate royalty-free music automatically from a text prompt. Creators request e.g. **"Lo-fi chill beat 20 seconds"** and the AI produces a track for use in the catalog or in videos.

## Example stack

| Provider | Notes |
|----------|--------|
| **Meta MusicGen** | Open-source, text-to-music. Can run self-hosted or via API. |
| **Suno AI** | Commercial API for music generation from prompts. |
| **Stability Audio** | Stability AI’s audio generation models. |

When implementing, choose one or more providers; the API can abstract behind a single **POST /music/ai/generate** endpoint.

## Intended flow

1. **Creator** sends a request with a **prompt** (e.g. "Lo-fi chill beat 20 seconds") and optional **duration**, **genre**, **mood**.
2. **Platform** calls the chosen AI provider (MusicGen, Suno, Stability Audio, etc.).
3. **AI** returns (or the platform generates) an **audio file** (e.g. MP3).
4. **Platform** uploads the file to the Audio CDN, creates a **MusicTrack** with `provider: 'ai_generated'`, `licenseType: 'royalty_free'`, and returns the track to the creator.

## Intended API (stub in place)

- **POST /music/ai/generate** (auth: creator or admin)  
  - **Body:** `{ prompt, durationSeconds?, genre?, mood? }`  
  - **Response (when implemented):** `{ track, audioUrl }` or `{ jobId, status: 'processing' }` for async generation.  
  - **Current:** Returns `501 Not Implemented` with `error: 'AI_MUSIC_GENERATOR_NOT_AVAILABLE'` and a link to this doc.

## Implementation checklist (future)

- [ ] Integrate at least one provider (Meta MusicGen, Suno, or Stability Audio).
- [ ] Store API keys / config (e.g. `MUSICGEN_API_URL`, `SUNO_API_KEY`, `STABILITY_AUDIO_API_KEY`) and feature flag (e.g. `AI_MUSIC_GENERATOR_ENABLED`).
- [ ] Optional: run generation in a **worker** (queue job) for long-running requests; return `jobId` and poll for completion.
- [ ] On success: upload generated audio to CDN (reuse Audio CDN storage), create **MusicTrack** with `uploadedBy`, `provider: 'ai_generated'`, `licenseType: 'royalty_free'`, then return track.
- [ ] Rate-limit per user to avoid abuse and control cost.
- [ ] Ensure Terms of Use and music license grant the platform the right to use AI-generated output as royalty-free library content.
