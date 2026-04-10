# Creator Music Upload Program

Allow artists to upload music to the catalog. Flow: **artist signup → upload track → license agreement → moderation → publish**. Revenue model: **platform rev share** — artists earn when their song trends.

## Flow

1. **Artist signup** — User applies via **POST /music/artist/apply** with `acceptLicense: true`. Creates **MusicArtist** with status `pending`. Admin approves via **PATCH /music/admin/artists/:id** (`status: approved | rejected`).
2. **Upload track** — Approved artists use **POST /music/upload** or **POST /music**. Tracks from approved artists are created with status **draft** and **revSharePercent** from the artist record. Non-artists and admins keep previous behavior (e.g. active or chosen status).
3. **License agreement** — Stored at signup: **licenseAgreementVersion**, **licenseAgreementAcceptedAt** on MusicArtist. Required in apply body.
4. **Moderation** — Artist submits draft via **POST /music/tracks/:id/submit** (draft → **pending_review**). Admin approves or rejects via **PATCH /music/admin/tracks/:id** (`status: active | rejected`, optional **moderationNote**). **moderatedBy**, **moderatedAt** set.
5. **Publish to catalog** — Only tracks with **status: active** appear in **GET /music**, **GET /music/trending**, and public catalog.

## Schemas

- **MusicArtist** — userId, status (pending | approved | rejected), revSharePercent, licenseAgreementVersion, licenseAgreementAcceptedAt, appliedAt, approvedBy, approvedAt, rejectionReason.
- **MusicTrack** — status extended to **draft**, **pending_review**, **rejected**; added revSharePercent, moderatedBy, moderatedAt, moderationNote.
- **MusicTrackEarning** — trackId, artistId, amountCents, period, source (trending | usage | payout), paidAt. Used when song trends (platform rev share).

## API

| Endpoint | Description |
|----------|-------------|
| **POST /music/artist/apply** | Apply as artist (body: acceptLicense, optional licenseVersion). Returns 409 if already applied. |
| **GET /music/artist/me** | Current user's artist application status. |
| **GET /music/artist/tracks** | My tracks (draft, pending_review, active, rejected). Query: status, limit, offset. |
| **POST /music/tracks/:id/submit** | Submit draft for review (owner only). |
| **GET /music/artist/earnings** | Approved artists only. List MusicTrackEarning, totalCents, revSharePercent. |
| **PATCH /music/admin/artists/:id** | Approve/reject artist (body: status, rejectionReason). |
| **GET /music/admin/artists** | List artist applications (query: status, limit, offset). |
| **PATCH /music/admin/tracks/:id** | Moderate track (body: status active|rejected, moderationNote). |

## Revenue model

- **revSharePercent** (default 70%, configurable via **ARTIST_REV_SHARE_PERCENT**) — artist share when song trends.
- Earnings are recorded in **MusicTrackEarning** (e.g. when a job calculates revenue from trending/usage and credits the artist). Payouts can use the existing payout pipeline; **GET /music/artist/earnings** exposes history and total.

## Config

- **ARTIST_REV_SHARE_PERCENT** — default artist share (e.g. 70).
- **ARTIST_LICENSE_VERSION** — version string for license agreement (e.g. 1).
