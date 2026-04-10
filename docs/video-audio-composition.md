# Video + Audio Composition (FFmpeg)

## Overview

Creators can combine a **video** (stream recording) with a **music track** to produce a final media file. The system uses an FFmpeg worker and the filter `amix=inputs=2` to mix the video’s audio with the selected track (with optional trim and volume).

**Flow:** Creator submits job → API enqueues → Worker runs FFmpeg → Output URL stored.

## Job payload

- **video_id** — `LiveStream` _id (must be the creator’s stream with a `recordingUrl`).
- **audio_id** — `MusicTrack` _id (active track with `audioUrl` / `streamUrl`).
- **trim_start** — (optional) Start time in seconds for the music clip. Default: 0.
- **trim_end** — (optional) End time in seconds for the music clip. Omit for full track.
- **volume** — (optional) Music volume multiplier (0–2). Default: 1.

## API

- **POST /content/compose** (auth)
  - Body: `{ video_id, audio_id, trim_start?, trim_end?, volume? }`
  - Returns: `{ ok: true, job_id, status: "pending", message }`

- **GET /content/compose/:jobId** (auth, owner only)
  - Returns: `{ job_id, status, output_url, error, created_at, updated_at }`
  - Status: `pending` | `processing` | `completed` | `failed`

- **GET /content/compose/:jobId/file** (auth, owner only)
  - Serves the composed MP4 when `COMPOSED_MEDIA_DIR` is set and the API has access to the same directory as the worker.

## FFmpeg command (worker)

Example equivalent:

```bash
ffmpeg -y -i video.mp4 -i music.mp3 \
  -filter_complex "[0:a]volume=1.0[va];[1:a]atrim=start=0:end=30,volume=0.5[ma];[va][ma]amix=inputs=2:duration=first[aout]" \
  -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 128k -shortest output.mp4
```

- `[0:a]` = video audio, `[1:a]` = music.
- Music is trimmed with `atrim=start=X:end=Y` and scaled with `volume=Z`.
- Output: video stream + mixed audio (AAC 128k), duration = shortest of the two.

## Environment (worker + optional API)

- **COMPOSED_MEDIA_DIR** — Directory where the worker writes `{jobId}.mp4`. Default: `./storage/composed`.
- **COMPOSED_MEDIA_BASE_URL** — Optional base URL for the composed file (e.g. CDN). If set, `output_url` is `{COMPOSED_MEDIA_BASE_URL}/{jobId}.mp4`.

For **GET /content/compose/:jobId/file** to work, the API process must have read access to `COMPOSED_MEDIA_DIR` (e.g. shared volume in Docker/Kubernetes).

## Queue

- **Queue name:** `composition` (BullMQ, Redis).
- **Producer:** API (`getCompositionQueue().add('compose', { jobId, videoUrl, audioUrl, trimStart, trimEnd, volume })`).
- **Consumer:** `@millo/workers` composition worker (requires FFmpeg; workers Dockerfile installs it on Alpine).

## Database

- **CompositionJob** — `userId`, `videoId`, `audioId`, `trimStart`, `trimEnd`, `volume`, `status`, `videoUrl`, `audioUrl`, `outputUrl`, `error`, timestamps.
