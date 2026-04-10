# Phase 13 — Global Marketing Campaigns

**Owns:** Platform marketing campaigns, channels, localized campaigns, affiliate programs, attribution.  
**Depends on:** Phase 2 (schemas), Region, marketing routes.

Acquire users internationally.

---

## Marketing Channels

| Channel | Use |
|---------|-----|
| `tiktok` | TikTok Ads |
| `youtube` | YouTube Shorts |
| `instagram` | Instagram Reels |
| `influencer` | Influencer marketing |
| `affiliate` | Affiliate programs |

## Localized Campaign Types

| Type | Example Region | Description |
|------|----------------|-------------|
| `pix_bonus` | Brazil (BR) | PIX payment bonus campaigns |
| `creator_monetization` | India (IN) | Creator monetization campaigns |
| `business_tools` | Europe (EU) | Creator business tools |
| `influencer_partnership` | US | Influencer partnerships |
| `generic` | Any | Generic acquisition |

## Schemas

- **MarketingCampaign** — channel, campaignType, targetRegions[], status, budgetCents, spentCents, startsAt, endsAt, utmSource, utmMedium, utmCampaign, affiliateCode, meta.
- **MarketingAttribution** — userId, campaignId, source, medium, campaign, convertedAt, meta.

## API

- `GET /marketing/campaigns` — List platform campaigns (admin). Query: region, status.
- `POST /marketing/campaigns` — Create campaign (admin).
- `GET /marketing/campaigns/active` — Active campaigns for user's region (public, for localized offers).
- `POST /marketing/attribution` — Record signup attribution (utm params). Called on signup.

## Domain

All behaviour bound to https://milloapp.com.
