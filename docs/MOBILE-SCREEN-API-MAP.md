# Mobile Screen ↔ API ↔ Component Map

The mobile package (`packages/mobile`) provides full app screens that consume the Millo API. This document maps each app screen to the APIs and shared components it uses.

**Domain:** https://milloapp.com

---

## Architecture

- **API client:** `src/api/client.js` — `get()`, `post()`, `del()` with Bearer token from SecureStore
- **Auth:** `src/context/AuthContext.js` — login, logout, token persistence
- **Theme:** `src/theme/colors.js` — light/dark palettes

---

## Screen → API Map

| Screen | File | APIs Consumed | Purpose |
|--------|------|---------------|---------|
| **ProfileScreen** | `screens/ProfileScreen.js` | `GET /content/profile`, `PATCH /content/profile`, `GET /content/wallet`, `GET /auth/me` | My profile, edit display name/bio, wallet balance, biometric toggle |
| **WalletScreen** | `screens/WalletScreen.js` | `GET /content/wallet`, `GET /payments/wallet/transactions`, `GET /payments/payouts/history`, `POST /payments/payouts/withdraw` | Balance, transactions, payout requests |
| **LiveScreen** | `screens/LiveScreen.js` | `GET /content/streams?status=live` | Live stream grid, HLS playback via `react-native-video` (streamUrl/playbackUrl/hlsUrl) |
| **GoLiveScreen** | `screens/GoLiveScreen.js` | `POST /content/streams/start`, `POST /content/streams/:id/stop` | Creator stream control: start/stop, stream key, RTMP URL, OBS guide |
| **MessagesScreen** | `screens/MessagesScreen.js` | `GET /dm/conversations`, `GET /dm/conversation/:userId/messages`, `POST /dm/messages` | DM list, thread view, send message |
| **CoinStoreScreen** | `screens/CoinStoreScreen.js` | `GET /pricing/coin-packs`, `POST /payments/checkout/coins` | Buy coin packs |
| **SubscribeScreen** | `screens/SubscribeScreen.js` | `GET /content/creators/:id`, `POST /subscriptions/subscribe` | Creator subscription plans |
| **CreatorProfileScreen** | (in tests) | `GET /content/creators/:id` | Creator public profile |
| **SearchScreen** | (in tests) | `GET /content/search` | Search users/streams/products |
| **HomeScreen** | (in tests) | `GET /content/feed` | For-you feed |
| **LoginScreen** | (in tests) | `POST /auth/login` | Email/password login |
| **RegisterScreen** | (in tests) | `POST /auth/register` | Registration |
| **NotificationsScreen** | (in tests) | `GET /notifications` | Notification list |
| **ShopScreen** | (in tests) | `GET /economy/shopfront/:creatorId` | Creator shop |
| **ReplaysScreen** | `screens/ReplaysScreen.js` | `GET /content/replays` or similar | VOD/replay list |
| **SubscriptionsScreen** | `screens/SubscriptionsScreen.js` | `GET /subscriptions/mine` or similar | My subscriptions |

---

## Shared Components

| Component | Location | Used By |
|-----------|----------|---------|
| **MilloCoin** | `components/MilloCoin.js` | ProfileScreen, WalletScreen, CoinStoreScreen, gift UI |
| **AuthContext** | `context/AuthContext.js` | All authenticated screens |
| **LiveFiltersSDK** | Native (Swift/Kotlin) | Live host flow — filters/effects |

---

## API Endpoints Used by Mobile

| Endpoint | Method | Screens |
|----------|--------|---------|
| `/auth/login` | POST | LoginScreen |
| `/auth/register` | POST | RegisterScreen |
| `/auth/me` | GET | ProfileScreen, AuthContext |
| `/content/profile` | GET, PATCH | ProfileScreen |
| `/content/wallet` | GET | ProfileScreen, WalletScreen |
| `/content/streams` | GET | LiveScreen |
| `/content/streams/start` | POST | GoLiveScreen |
| `/content/streams/:id/stop` | POST | GoLiveScreen |
| `/content/feed` | GET | HomeScreen |
| `/content/search` | GET | SearchScreen |
| `/content/creators/:id` | GET | CreatorProfileScreen, SubscribeScreen |
| `/dm/conversations` | GET | MessagesScreen |
| `/dm/conversation/:userId/messages` | GET | MessagesScreen |
| `/dm/messages` | POST | MessagesScreen |
| `/payments/wallet/transactions` | GET | WalletScreen |
| `/payments/payouts/history` | GET | WalletScreen |
| `/payments/payouts/withdraw` | POST | WalletScreen |
| `/payments/checkout/coins` | POST | CoinStoreScreen |
| `/pricing/coin-packs` | GET | CoinStoreScreen |
| `/subscriptions/subscribe` | POST | SubscribeScreen |
| `/economy/shopfront/:creatorId` | GET | ShopScreen |

---

## Gaps & Recommendations

1. **ProfileScreen** — ✓ Links to Wallet, Privacy/DSAR, Blocked users, Go Live (for approved creators)
2. **Live viewer** — ✓ LiveScreen uses `streamUrl`/`playbackUrl`/`hlsUrl` from `GET /content/streams` enriched response
3. **Go Live (host)** — ✓ GoLiveScreen: `POST /content/streams/start`, stream key, RTMP URL, OBS guide; reachable from Profile
4. **Blocked users** — ✓ BlockedUsersScreen using `GET /profile/blocked`, `POST /profile/unblock`
5. **Privacy/DSAR** — ✓ PrivacySettingsScreen using `GET /dsar/export`, `POST /dsar/delete`

---

## Native Modules (iOS/Android)

- **LiveFiltersSDK** — `GET /live/filters/status`, `GET /live/filters/list` for filter/effect metadata
- **Biometrics** — Local auth; no API
- **expo-secure-store** — Token storage
