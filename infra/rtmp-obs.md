# RTMP ingest and OBS compatibility

**Pro ingest stack (nginx-rtmp, minimal vs full config):** `infra/obs-rtmp-ingest-pro.md`

Millo uses **stream keys** for RTMP ingest. Each live stream has a unique key generated at start.

## Stream key

- **When:** Generated when the streamer calls `POST /live/start` (or equivalent). Stored in `LiveStream.streamKey`.
- **Retrieval:** Stream owner only: `GET /live/stream/:streamId/key` (requires auth). Returns `{ streamKey }`.
- **Security:** Do not expose the stream key in public stream info or logs.

## RTMP URL (ingest server)

Configure your RTMP ingest server (e.g. nginx-rtmp, Node Media Server, or a third-party provider) to accept:

- **Server URL:** Set via `RTMP_INGEST_URL` (e.g. `rtmp://ingest.milloapp.com/live`).
- **Stream key:** The value from `GET /live/stream/:streamId/key` for the current stream.

Full RTMP URL for OBS = `RTMP_INGEST_URL` + stream key as the stream name (e.g. `rtmp://ingest.milloapp.com/live/millo_abc123...`), or per your ingest server’s convention.

## OBS Studio

1. Open **Settings → Stream**.
2. **Service:** Custom.
3. **Server:** Your RTMP ingest URL (e.g. `rtmp://ingest.milloapp.com/live`).
4. **Stream key:** Paste the stream key from the Millo app (Get stream key for this stream).
5. Start streaming from OBS; the ingest server should associate the key with the correct `streamId` (ingest server must map key → streamId if you use a separate service).

## Implementation note

The API and schema provide stream key generation and retrieval. The actual RTMP ingest server (nginx-rtmp or other) must be deployed and configured separately; map incoming stream key to `LiveStream` and push to your CDN or playback pipeline.

https://milloapp.com
