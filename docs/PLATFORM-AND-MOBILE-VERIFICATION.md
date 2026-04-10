# Platform & Mobile ? Feature ? Web Page ? API ? Mobile Verification

Maps each feature area to **API**, **Web page** (route), and **Mobile** (component/screen).  
**?** = present; **?** = not applicable; **Partial** = stub or partial.

---

## Web routes (all pages)

| Route | Page | Purpose |
|-------|------|---------|
| `/` | LandingPage | Landing, links to help/terms/privacy |
| `/live` | LiveNowPage | Live streams list |
| `/go-live` | GoLivePage | Creator stream control (start, stream key, OBS) |
| `/feed` | ForYouPage | Shorts/for-you feed |
| `/login` | LoginPage | Login (placeholder auth) |
| `/help` | HelpCenterPage | Help + FAQ |
| `/creator/milla` | MillaPage | MILLA virtual streamer |
| `/creator/:id` | CreatorPage | Creator profile |
| `/creator/:id/shop` | ShopfrontPage | Creator shop |
| `/creator/:id/auctions` | AuctionsPage | Creator auctions |
| `/creator/:id/shop/:productId` | ProductDetailPage | Product/auction detail |
| `/terms` | TermsPage | Terms of Use |
| `/privacy` | PrivacyPage | Privacy Policy |
| `/admin` | AdminPage | Admin dashboard |
| `/support` | SupportPage | Support dashboard |
| `/mod` | ModeratorPage | Moderator dashboard |
| `/brand` | BrandDashboardPage | Brand/advertiser campaign management |

**Note:** HomePage.jsx exists but is not routed in App.jsx (used elsewhere or legacy).

---

## 1. Account & Identity

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| Email/password auth | Auth shell only (no token validation) | `/login` (LoginPage) | ? |
| OAuth (Google, Apple, Facebook) | GET /auth/oauth/google, /facebook, /apple + callbacks | Link from LoginPage or redirect | ? |
| Biometric login | ? | ? | ? BiometricAuth.swift, BiometricAuth.kt |
| Sessions | Session schema; POST /auth/sessions/:id/invalidate | ? | ? |
| RBAC | Dashboards enforce role | /admin, /support, /mod | ? |
| Blocked users | POST/DELETE /profile/block/:userId, GET /profile/blocked, GET /dm/blocked | ? | ? |
| Appeals | GET/POST dashboards/mod/appeals* | ModeratorPage (appeals) | ? |

**Gap:** No dedicated web page for ?Blocked users? or ?Sessions?; API only. Mobile has ProfileScreen, PrivacySettingsScreen, BlockedUsersScreen.

---

## 2. Profile system

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| Public profile | ? (Profile schema; creator data via app) | `/creator/:id` (CreatorPage) | ? ProfileScreen, CreatorProfileScreen |
| Followers / following | GET /profile/:userId/followers, /following; POST/DELETE /profile/follow/:userId | CreatorPage can call API | ? |
| Trust tier / Level | GET /level/:userId, /trust/:userId | Can be shown on CreatorPage / discovery | ? |
| Bio & external links | Profile schema | CreatorPage | ? |
| Creator badges | POST/DELETE /dashboards/admin/creators/:id/badges | AdminPage | ? |
| Shopfront | GET /economy/shopfront/:creatorId | `/creator/:id/shop` (ShopfrontPage) | ? |

**Gap:** No dedicated "My profile" or "Edit profile" web page; no followers/following UI on web. Mobile has ProfileScreen, ShopScreen.

---

## 3. Level & trust engine

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| Level / trust / gating | GET /level/:userId, /trust/:userId; POST /gated | Used by backend; can surface on creator/feed | ? |

**Gap:** No dedicated ?Level? or ?Trust? web page; API used by other features.

---

## 4. Live streaming

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| Start/end stream | POST /content/streams/start, /content/streams/:id/stop | `/go-live` (GoLivePage) | ? GoLiveScreen |
| Stream info + viewer count | GET /content/streams, /content/streams/:id | `/live` (LiveNowPage) lists streams | ? LiveScreen |
| Stream key (RTMP/OBS) | Returned by POST /content/streams/start | GoLivePage shows key + ingest URL | ? GoLiveScreen shows key + RTMP URL |
| Join/leave, heartbeat | POST /live/join, /live/leave, /live/stream/:id/heartbeat | ? | ? |
| MILLA co-host, gift, mute | POST /live/milla/cohost, /live/milla/gift, /live/milla/mute; POST /live/cohost/request (generic) | `/creator/milla` (MillaPage) | ? |
| Moderation | POST /live/moderate, dashboards/mod/live-moderation; AI moderation (OpenAI omni-moderation-latest) | ModeratorPage | ? |
| Filters status/list | GET /live/filters/status, /live/filters/list | ? | ? LiveFiltersSDK (iOS/Android) |

**Coverage:** Web has GoLivePage for host flow; LiveNowPage for viewer list. Mobile has GoLiveScreen (start stream, stream key, OBS setup) and LiveScreen (live list + playback via streamUrl/playbackUrl/hlsUrl).

---

## 5. Live filters SDK

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| Filter status/list | GET /live/filters/status, /live/filters/list | ? | ? LiveFiltersSDK.swift, LiveFiltersSDK.kt |

---

## 6. Virtual streamers (MILLA)

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| MILLA status, co-host, gift, mute | GET /live/milla/status/:streamId; POST /live/milla/cohost, /live/milla/gift, /live/milla/mute | `/creator/milla` (MillaPage) | ? |

---

## 7. Short video feed

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| For-you feed | Discovery ranking (backend) | `/feed` (ForYouPage) | ? |

---

## 8. Economy

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| Shopfront | GET /economy/shopfront/:creatorId | `/creator/:id/shop` | ? |
| Auctions list | GET /economy/shopfront/:creatorId/auctions | `/creator/:id/auctions` (AuctionsPage) | ? |
| Gifts, ledger, wallet | Economy package (used by dashboards/security) | ? | ? |

**Gap:** No web page for ?Wallet? or ?Coin balance?; economy APIs used by admin/support.

---

## 9. Live commerce

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| Shop, auctions | GET /economy/shopfront/:id, /auctions | ShopfrontPage, AuctionsPage, ProductDetailPage | ? |

---

## 10. Direct messaging

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| Send/list messages | POST /dm/messages; GET /dm/conversation/:userId/messages | ? | ? MessagesScreen |
| Message delete | DELETE /dm/messages/:id | ? | ? |
| Typing, blocked | POST /dm/typing; GET /dm/blocked, /dm/blocked/:userId | ? | ? OfflineDMQueue (iOS), OfflineFirstStorage (Android) |

**Gap:** No web page for "Messages" or "Conversations"; API only. Mobile has MessagesScreen (DM list + thread).

---

## 11. Paid audio/video calls

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| DM monetization (per-minute) | dm-monetization package; DMSession | ? | Offline queue for session events |

**Gap:** No web or mobile ?Calls? screen; backend only.

---

## 12. Ads engine

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| Delivery (auction, pacing, frequency cap) | Ads package (server-side) | ? | ? |

**Coverage:** Brand dashboard at /brand (BrandDashboardPage) ? campaigns, create, analytics.

---

## 13. Billing & payouts

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| Payouts, webhooks, ledger | Billing package; dashboards/admin | AdminPage (financial-ops), SupportPage (refund) | ? |

---

## 14. Admin dashboard

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| Financial ops, kill-switch, ledger | POST/GET dashboards/admin/* | `/admin` (AdminPage) | ? |

---

## 15. Moderator dashboard

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| Live mod, abuse queue, appeals | POST/GET dashboards/mod/* | `/mod` (ModeratorPage) | ? |

---

## 16. Support dashboard

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| Tickets, refund, user tools | POST/GET dashboards/support/* | `/support` (SupportPage) | ? |

---

## 17. Compliance

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| DSAR, consent, age-check, CCPA, IP logging | GET /compliance/dsar, /ccpa/do-not-sell, /ip-logging; POST /dsar/delete, /compliance/ccpa/do-not-sell, /compliance/ip-logging | `/settings/privacy` (PrivacySettingsPage) | ? PrivacySettingsScreen |

**Coverage:** Privacy settings at /settings/privacy ? DSAR export, delete, CCPA Do Not Sell, IP logging toggles.

---

## 18. Mobile app (iOS + Android)

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| Biometric login | ? | ? | ? BiometricAuth (iOS + Android) |
| Push notifications | Notifications; GET /notifications/push-payload | ? | ? PushService (iOS), FcmPushService (Android) |
| Email notifications | SendGrid; sendEmail (templates, welcome, payout, etc.) | ? | ? |
| Offline DM queue | ? | ? | ? OfflineDMQueue (iOS), OfflineFirstStorage (Android) |
| Transparent nav bars | ? | ? | ? TransparentNavBar (iOS) |
| Retina assets | ? | ? | ? Assets-README (iOS) |
| Battery-efficient background | ? | ? | ? BatteryEfficientBackground (iOS), DozeAwareWorker (Android) |
| Light/Dark theme | ? | ? | ? LightDarkTheme (iOS + Android) |
| Live Filters SDK | GET /live/filters/status, /list | ? | ? LiveFiltersSDK (iOS + Android) |
| Device analytics | DeviceAnalytics schema; recorded on /live/join; creator analytics endpoint | ? | ? |
| Live viewer | GET /content/streams?status=live, streamUrl/playbackUrl | ? | ? LiveScreen (list + playback) |
| Go Live (host) | POST /content/streams/start, /:id/stop | ? | ? GoLiveScreen (stream key, RTMP, OBS) |
| Profile, Wallet, Messages, Privacy | Various | ? | ? ProfileScreen, WalletScreen, MessagesScreen, PrivacySettingsScreen |

**Coverage:** Mobile includes full screens for Live viewer, Go Live (host), Profile, Wallet, Messages, Privacy, Subscriptions, Shop, etc. Go Live is reachable from Profile for approved creators.

---

## 19. Smart TV

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| Pairing, channels, schedule, streams | POST /tv/pairing/*; GET /tv/channels, /tv/streams, etc. | ? | ? (TV app separate) |

**Gap:** No web page for ?TV pairing?; TV apps use API directly.

---

## 20. Public web

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| Landing | ? | `/` (LandingPage) | ? |
| Creator pages | ? | `/creator/:id` | ? |
| Shop / auctions | GET /economy/shopfront/* | /creator/:id/shop, /creator/:id/auctions, ProductDetailPage | ? |
| Help, FAQ | ? | `/help` (HelpCenterPage + FAQ section) | ? |
| Terms, Privacy | ? | `/terms`, `/privacy` | ? |
| Cookie consent | ? | CookieConsent component (layout) | ? |
| SEO, sitemap | ? | SEO.jsx; public/sitemap.xml | ? |

---

## 21?25. Infra, security, DevOps, observability, AI

| Feature | API | Web page | Mobile |
|---------|-----|----------|--------|
| Health, observation | GET /health, /observation/* | ? | ? |
| Security (CSP, HSTS, CORS, kill-switches) | app.js; GET /security/kill-switches, /security/ledger-integrity | ? | ? |
| Level/trust, discovery, ads, MILLA, AI | Various packages | Used by feed, live, creator, admin | ? |

---

## Implemented items (complete)

| Item | Status |
|------|--------|
| Creator badges | **COMPLETE** |
| Device analytics | **COMPLETE** |
| Co-host API | **COMPLETE** |
| AI moderation | **COMPLETE** |
| Email notifications | **COMPLETE** |

---

## Summary: coverage and gaps

### Platform (API + web)

- **Covered:** Landing, help/FAQ, creator profile, shop, auctions, product detail, live list, for-you feed, MILLA page, terms, privacy, cookie consent, SEO, sitemap, login, admin/mod/support dashboards. APIs exist for auth (OAuth stubs), profile (follow/block), live (start/end/stream key/join/heartbeat/MILLA), economy (shopfront/auctions), DM (messages, typing, blocked), notifications, compliance, level/trust, security, observation. **Implemented:** Creator badges, device analytics, co-host API, AI moderation (OpenAI), email notifications (SendGrid).
- **Web pages (implemented):**  
  - **Profile:** ?My profile? or ?Edit profile?; followers/following list.  
  - **Live:** ?Go live? / ?Start stream? (host); stream key display; in-app live viewer.  
  - **DM:** `/messages` ? conversation list + thread.  
  - **Wallet:** `/wallet` ? balance, payouts.  
  - **Compliance:** ?Privacy settings? or ?Download my data? (DSAR).  
  - **Blocked users:** `/blocked` ? manage blocked list.
  - **TV pairing:** `/tv-pairing` ? connect Apple TV / Android TV.

### Mobile app

- **In repo:** Biometric auth, push (APNs/FCM), offline DM queue, battery-efficient background, light/dark theme, transparent nav bar, Retina assets (doc), Live Filters SDK. **Full screens:** LiveScreen (live viewer with streamUrl/playbackUrl/hlsUrl), GoLiveScreen (host ? start stream, stream key, RTMP URL, OBS guide), ProfileScreen, WalletScreen, MessagesScreen, PrivacySettingsScreen, SubscriptionsScreen, ShopScreen, etc.
- **Conclusion:** Mobile includes full app screens for Live viewer, Go Live (host), Profile, Wallet, Messages, Privacy, and more. Go Live is reachable from Profile for approved creators.

### Recommendation

1. **Web:** Implemented ? Go live (`/go-live`), Live list (`/live`), creator pages, shop, dashboards. See routes above.  
2. **Mobile:** Full screens implemented ? Live viewer (LiveScreen), Go Live (GoLiveScreen), Profile, Wallet, Messages, Privacy, etc.  
3. **Feature report:** Use `docs/FEATURE-VERIFICATION-REPORT.md` for per-feature status and `docs/PLATFORM-AND-MOBILE-VERIFICATION.md` (this file) for API ? web ? mobile mapping.
