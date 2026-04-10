# Audio Fingerprint Protection

Prevent copyright abuse by scanning uploads for known copyrighted music (Shazam-style recognition). Supported providers: **AudD**, **ACRCloud**, **Pex**.

## Upload flow

1. Creator uploads audio (or adds track via URL).
2. **Audio fingerprint scan** runs (buffer or URL).
3. If copyrighted music is **detected**:
   - **Block upload** — reject with `403 COPYRIGHT_DETECTED` (default).
   - **Mute video** — (future) flag content for audio muting.
   - **Replace audio** — (future) flag for replacement with royalty-free track.

## Configuration

- **AUDIO_COPYRIGHT_PROVIDER** — `audd` | `acrcloud` | `pex`. If unset, no scan (all uploads allowed).
- **AUDIO_COPYRIGHT_ACTION** — `block` | `allow` | `mute` | `replace`. Only `block` is implemented; `mute`/`replace` can be used to allow upload but flag for downstream processing.

### AudD

- [AudD Music Recognition API](https://docs.audd.io/)
- **AUDD_API_TOKEN** — from [dashboard.audd.io](https://dashboard.audd.io/).
- Supports file upload (multipart) or `url` parameter for recognition. Used for both **POST /music/upload** (buffer) and **POST /music** (URL).

### ACRCloud

- [ACRCloud Identification API](https://docs.acrcloud.com/reference/identification-api)
- **ACRCLOUD_ACCESS_KEY**, **ACRCLOUD_ACCESS_SECRET**, **ACRCLOUD_HOST** (e.g. `identify-eu-west-1.acrcloud.com`).
- Sends audio buffer; response includes `metadata.music[]` with title/artist when a match is found.

### Pex

- **PEX_API_KEY** — for Pex audio/copyright API. Integration is stubbed; adapt `copyrightScanService.js` to the actual Pex scan endpoint and response format when you have API details.

## Where scanning runs

| Endpoint / flow        | When scan runs                         | On detect (action=block)      |
|------------------------|----------------------------------------|------------------------------|
| **POST /music/upload** | After receiving file, before CDN upload| 403, no file stored          |
| **POST /music**        | When `audioUrl` is provided           | 403, no track created        |
| **POST /content/compose** | Audio is from library (already scanned) | N/A                         |

## API response when blocked

```json
{
  "error": "COPYRIGHT_DETECTED",
  "message": "Copyrighted music detected. Upload blocked to prevent copyright abuse.",
  "match": { "title": "...", "artist": "..." }
}
```

## Mute / replace (future)

- **Mute:** Run a job (e.g. post-upload or on VOD) that re-encodes the asset with muted or silent audio when a scan later flags it.
- **Replace:** Same flow but replace the flagged segment with a royalty-free track from the library. Both require storing scan results and a pipeline to re-process assets.

## Service location

- **packages/api/src/services/copyrightScanService.js** — `scanBuffer(buffer, contentType)`, `scanByUrl(audioUrl)`, `isConfigured()`, `getAction(result)`.
