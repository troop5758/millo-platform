# Music Monetization: Sponsored Sounds & Sound Challenges

Brands pay for sound promotion. Millo supports the same monetization model as short-video platforms.

## What Millo Gets With This System

- **Royalty-free music library** — Catalog of licensed tracks.
- **Creator sound discovery** — Search, trending, genre filters, sound picker.
- **Legal copyright protection** — Copyright scan + audio moderation (hate speech, adult).
- **Trending sounds engine** — Redis leaderboard, score from uses/shares/completion/likes.
- **Artist ecosystem** — Creator Music Upload Program, rev share when songs trend.
- **Brand monetization** — Sponsored sounds, brand audio campaigns, sound challenges.

## Products

### 1. Sponsored sounds

A brand pays to promote a specific track. The track appears in a **Sponsored** section in the Creator Audio Picker and can be prioritized in discovery.

- **Schema:** `SponsoredSound` — `trackId` (ref MusicTrack), `brandName`, `brandId`, `startAt`, `endAt`, `budgetCents`, `status` (draft | active | paused | ended), `priority`, optional `targetRegions`, `targetGenres`.
- **Public API:** **GET /music/sponsored** — Returns active sponsored tracks (within date range), ordered by priority. Used by the sound picker.
- **Admin API:** **POST /music/admin/sponsored-sounds** (body: trackId, brandName, startAt, endAt, budgetCents, status, priority, …), **GET /music/admin/sponsored-sounds**, **PATCH /music/admin/sponsored-sounds/:id**, **DELETE /music/admin/sponsored-sounds/:id**.

### 2. Brand audio campaigns

Brands run campaigns that promote one or more sounds. Implemented as one or more **SponsoredSound** (or **SoundChallenge**) records; optional future parent **BrandCampaign** can group them for reporting.

- **Current:** Use Sponsored sounds and Sound challenges; each has `brandName` and `budgetCents` for reporting. Billing/invoicing can be added later.

### 3. Sound challenges

Example: *"Nike challenge sound"* — a brand pays for a challenge tied to a track. Creators use the sound to participate; the challenge is displayed in the picker with name, brand, and prize/rules.

- **Schema:** `SoundChallenge` — `trackId` (ref MusicTrack), `brandName`, `challengeName`, `description`, `startAt`, `endAt`, `status`, `imageUrl`/`bannerUrl`, `prizeDescription`, `rules`, `budgetCents`.
- **Public API:** **GET /music/challenges** — Returns active challenges with populated track. Used by the sound picker **Challenges** section.
- **Admin API:** **POST /music/admin/challenges** (body: trackId, brandName, challengeName, description, startAt, endAt, imageUrl, prizeDescription, rules, …), **GET /music/admin/challenges**, **PATCH /music/admin/challenges/:id**, **DELETE /music/admin/challenges/:id**.

## Creator experience

- **Sound picker** — When adding a sound (e.g. Go Live), creators see:
  - **Sponsored** — Horizontal list of brand-promoted tracks (title + brand name).
  - **Challenges** — Horizontal list of active challenges (challenge name, brand, linked track); tapping uses that track.
  - **Trending sounds** — Main list from Redis leaderboard.
  - **Search** — By title, artist, genre.

## Implementation

- **Database:** `packages/database/src/schemas/SponsoredSound.js`, `SoundChallenge.js`.
- **API:** `packages/api/src/routes/music.js` — public `/music/sponsored`, `/music/challenges`; admin CRUD under `/music/admin/sponsored-sounds`, `/music/admin/challenges`.
- **Frontend:** `packages/web/src/sdk/musicApi.js` — `getMusicSponsored()`, `getMusicChallenges()`; `SoundPicker.jsx` loads and displays Sponsored and Challenges when not searching.

## Billing

- **budgetCents** is stored for reporting. Actual payment collection (brands pay Millo) can be wired to Stripe/invoicing in a later phase; the data model and admin flows are in place.
