# Profile design reference (web + mobile)

Design targets for **creator/user profile** from the provided reference images.

---

## Web profile (`/creator/:id`)

- **Top bar:** `@handle` on dark elevated chip (left); “Visit site” with envelope icon (right).
- **Header:** Large circular avatar (e.g. 96px), display name (bold), handle `@handle`, PREMIUM badge (gold/yellow pill, black text, trophy icon).
- **Actions:** Following (outline), Subscribed (gold fill, black text, trophy), Message (outline, envelope), ellipsis (circle button).
- **Stats row:** Five card-like blocks with icon + value + label:
  - Followers (people icon), Following (person icon), Subscribers (gold star), Videos (camera), Ads Manager (hash `#`; can be link or “—”).
- **Tabs:** Videos | Exclusive | Saved | Messages | Ads Manager. Active tab: gold underline.
- **Content (Videos):** Grid of video cards; each has thumbnail with **bottom-left dark overlay** (play ▶ + view count), title, “Video views”.
- **Theme:** Dark background, white/light grey text, gold (`--accent-premium`) for active/subscribed/PREMIUM.

**Implementation:** `packages/web/src/pages/CreatorPage.jsx` is aligned with this.

---

## Mobile profile

- **Status bar:** Time, signal, WiFi, battery.
- **Header:** Circular avatar, name “Millo Creator”, handle `@millocreator`, PREMIUM badge (dark grey pill, gold trophy + “PREMIUM” in white).
- **Actions:** Following, Subscribed, envelope (message) — same order as web.
- **Stats:** Three blocks in a row (not five): **Followers** (two people icon, “1.2K”, “Follower”), **Subscribers/Stars** (yellow star, “320”, “Subsc”), **Videos** (camera, “67”, “Videos”).
- **Tabs:** Videos (active, gold underline) | Exclusive | Saved | Me.
- **Content:** Two-column grid of video thumbnails; overlay top-left with play + view count (e.g. “3,4K”, “932”); below: “Video title goes here”, “1.2K vviews” / “932 vviews”.
- **Theme:** Dark (black), white text, gold for active/subscription.

**Implementation:** Mobile app has no profile screen in repo yet; use this when adding a Profile screen (e.g. in React Native or Swift/UIKit).

---

## Shared

- Dark theme, gold accent for premium/active states.
- PREMIUM badge and Subscribed button use gold; Subscribed uses black text on gold.
- Video cards: dark overlay on thumbnail with play icon + view count; title and “Video views” (or “X vviews”) below.
