# The 12 Bot Types Platforms Like TikTok Fight

Understanding these determines **what signals your system must detect**. Millo must detect both **individual bots** and **coordinated bot networks**.

## Bot type reference

| Bot type | Behavior | Risk |
|----------|----------|------|
| **Engagement bots** | Auto likes, follows | Fake popularity |
| **View bots** | Mass video plays | Algorithm manipulation |
| **Comment bots** | Spam comments | Scams |
| **DM bots** | Mass messaging | Phishing |
| **Follower bots** | Fake followers | Inflated creators |
| **Scraper bots** | Scrape user data | Privacy risk |
| **Gift bots** | Fake gifting loops | Financial fraud |
| **Live viewer bots** | Fake live audience | Monetization abuse |
| **Content bots** | AI auto-post channels | Spam networks |
| **Promo bots** | Link promotion | Malware |
| **Bot farms** | Coordinated accounts | Trend manipulation |
| **Account takeover bots** | Credential stuffing | Security breach |

---

## Signals the system must detect

For each bot type, the table below lists **required detection signals** and **Millo’s current coverage** (implemented, planned, or gap).

| Bot type | Signals to detect | Millo coverage |
|----------|-------------------|----------------|
| **Engagement bots** | Like/follow velocity per account; same IP/device across many accounts; implausible engagement ratios (e.g. likes >> views). | **Partial:** Device fingerprint + multi-account check (`checkMultiAccount`); gift and payment flows use fingerprint. Like/follow velocity and engagement-ratio checks not yet centralized. |
| **View bots** | View velocity; views with near-zero watch time; same IP/device generating many views; bot-like view patterns. | **Partial:** Sound fraud uses “bot views” (high views + low avg watch time) per sound (`soundFraud.js`). Per-video view velocity and view–watch consistency could be extended. |
| **Comment bots** | Comment velocity; duplicate or templated text; same IP/device spamming; link/mention spam. | **Gap:** Comments are stored; rate limits may apply. No dedicated comment-spam or link-spam detection. Add: velocity per user/stream, similarity/duplicate detection, link/mention rules. |
| **DM bots** | Message velocity; mass unsolicited DMs; link/phishing patterns; same IP/device messaging many users. | **Gap:** DM/messaging flows exist; velocity and content-based (phishing/link) detection not documented. Add: rate limits, content scan, device/IP clustering. |
| **Follower bots** | Follow velocity; follow/unfollow loops; followers with no activity; same IP/device following many accounts. | **Gap:** Follower data exists; no dedicated “fake follower” or velocity signals. Add: follow velocity, device/IP clustering, activity-based scoring. |
| **Scraper bots** | High request volume; scraping patterns (e.g. sequential IDs, bulk profile/page fetches); missing or bot-like headers. | **Partial:** Rate limiting and API design reduce exposure. No dedicated anti-scraping or request-pattern detection. Add: per-IP/per-user request patterns, blocklists. |
| **Gift bots** | Gift velocity; circular gifts (A→B→A); same device many accounts gifting; unrealistic gift volume. | **Implemented:** `evaluateGiftRisk`, `checkGiftVelocity`, `checkCircularGifts`, `checkMultiAccount`; FraudEvent `gift`; velocity and circular thresholds. |
| **Live viewer bots** | Viewer join spike in short window; same IP/device many “viewers”; no or minimal watch time. | **Implemented:** `detectViewerSpike(streamId)` (VIEWER_SPIKE_THRESHOLD); FraudEvent `viewer_spike`. Optional: per-viewer watch/join consistency. |
| **Content bots** | Bulk or AI-like uploads; same device many channels; templated or low-quality content. | **Partial:** Upload and moderation exist; sound/video fraud uses device diversity. No dedicated “content farm” or AI-post detection. Add: upload velocity, device clustering, quality/similarity signals. |
| **Promo bots** | Links in comments/bio/DMs; known malware/redirect URLs; promotion velocity. | **Gap:** Link and content policies exist; no centralized URL/malware or promo-velocity detection. Add: URL blocklist, link extraction + scoring, velocity. |
| **Bot farms** | Same device or IP across many accounts; coordinated timing; similar behavior across accounts. | **Partial:** Device fingerprint + `checkMultiAccount` (MULTI_ACCOUNT_THRESHOLD); IP reputation; sound fraud uses same IP/coordinated accounts. Expand: graph of device/IP–account clusters, cross-product signals. |
| **Account takeover bots** | Credential stuffing; login velocity; impossible travel; new device + sensitive action. | **Partial:** Login/session and device recording exist; IP and device checks in payment/gift. No dedicated credential-stuffing or impossible-travel detection. Add: login velocity, failed-login patterns, geo/travel rules. |

---

## Individual vs coordinated detection

- **Individual bots:** Single-account signals (velocity, engagement ratios, view/watch consistency, link spam, etc.). Implement per-user/per-resource checks and rate limits; log and score in FraudEvent.
- **Coordinated bot networks:** Same device, same IP, or linked accounts behaving similarly. Use **device fingerprint**, **IP clustering**, and **multi-account checks**; aggregate signals across accounts that share fingerprint or IP (e.g. `checkMultiAccount`, sound fraud’s same_ip_uploads / coordinated_accounts). Feed into a single risk view (e.g. “this device/IP has N accounts”) and block or review at that level.

Millo already uses device fingerprint and multi-account logic for gifts and payments; extend the same patterns (fingerprint + IP + velocity + clustering) to comments, DMs, follows, views, and logins so both individual and coordinated abuse are covered.

---

## Implementation references

- **Anti-bot architecture (5 layers):** [anti-bot-system-architecture.md](anti-bot-system-architecture.md) — Client, API Gateway, Detection, Action layers and Millo mapping.
- **Fraud service:** `packages/api/src/services/fraudService.js` — payment, gift, viewer spike, multi-account, device recording.
- **FraudEvent:** `packages/database/src/schemas/FraudEvent.js` — eventType: `payment`, `login`, `signup`, `payout`, `order`, `ppv_unlock`, `gift`, `viewer_spike`, `sound_gaming`.
- **Sound fraud (view bots):** `packages/workers/src/lib/soundFraud.js` — bot_views, same_ip_uploads, coordinated_accounts, rapid_reuse_same_device.
- **Phase 11 fraud:** [phase-11-fraud-prevention.md](phase-11-fraud-prevention.md).

Use this document to prioritize which bot types to implement or harden next and to ensure detection covers both individual and coordinated bot networks.
