# Platform implementation — legal & privacy (engineering)

Maps **legal** documents under `legal/` to **product and API** behavior. The public API is rooted at the **Millo API host** (e.g. `https://api.milloapp.com`). Paths are **not** prefixed with `/api/` unless you add a gateway layer.

**Counsel** owns policy text; engineering owns accurate wiring. https://milloapp.com

---

## 8. Required platform implementation

### A. Consent checkbox (mandatory)

```html
<input type="checkbox" required />
<span>
  I agree to the Terms of Service and Privacy Policy
</span>
```

Wrap the control in a **`<label>`** (or associate `htmlFor` / `id`) so the label text is clickable. Link **Terms of Service** and **Privacy Policy** to **`/terms`** and **`/privacy`** on https://milloapp.com.

Record consent in the API with **`POST /compliance/consent`** (`purpose`, `version`, `granted`) — `packages/api/src/routes/compliance.js`.

---

### B. DSAR API (data request)

| Tutorial / generic | Millo (actual) |
|-------------------|----------------|
| `POST /api/dsar/request` | **`POST /dsar/request`** on the API host — body: `{ type: 'export' \| 'delete' \| 'rectification' \| 'restriction', lawBasis?: 'gdpr' \| 'ccpa' \| … }` |
| `GET /api/dsar/status` | **No dedicated status route.** **`POST /dsar/request`** returns the created **`DsarRequest`** (e.g. `status: 'pending'`). Track updates via DB/admin tooling or add a read endpoint if product requires it. |

Additional routes:

| Action | Method | Path |
|--------|--------|------|
| Export (JSON) | `GET` | `/dsar/export` |
| Account deletion | `POST` | `/dsar/delete` — `{ confirm: true, immediate?: boolean }` |
| Legacy export | `GET` | `/compliance/dsar` |

**Web SDK:** `packages/web/src/sdk/contentApi.js` — `requestDsar`, `getDsarExport`, `requestDsarDelete`.

---

### C. Cookie consent banner

```jsx
if (!cookiesAccepted) {
  return <CookieBanner />;
}
```

**Millo:** use **`packages/web/src/components/CookieConsent.jsx`** (storage key **`millo_cookie_consent`**). Wire `cookiesAccepted` from the same storage/state your banner sets when the user accepts or declines.

---

### D. Audit logging (compliance)

Tutorial-style:

```js
await AuditLog.create({
  action: 'USER_DATA_REQUEST',
  userId,
});
```

**Millo:**

- DSAR intake already creates **`DsarRequest`** records via **`@millo/compliance`** (`packages/compliance/src/dsar.js`).
- Consent events use **`ConsentLog`** via **`POST /compliance/consent`**.
- For a **general** audit row (action codes you define), prefer **`writeAuditLog`** from **`@millo/database`** (`packages/database/src/auditWrites.js`) so normalization and failure handling stay consistent:

```js
const db = require('@millo/database');
await db.writeAuditLog({
  action: 'USER_DATA_REQUEST',
  userId,
  actorId: userId,
  meta: { source: 'dsar' },
});
```

**Financial mutations** and **admin overrides** must still use **`writeFinancialAuditLog`** / **`writeAdminAuditLog`** per Millo system rules where applicable.

---

## 9. Compliance checklist

### Must have before launch

- [ ] **Terms** visible on signup
- [ ] **Privacy policy** accessible
- [ ] **Cookie consent** active
- [ ] **DSAR request** system working (`/dsar/request`, export, delete — see § B)
- [ ] **KYC** enforced for payouts
- [ ] **Refund + dispute** flow active
- [ ] **Moderation policy** enforced

### Recommended before launch

- [ ] **DMCA** contact and process published (`legal/dmca-policy.md`)
- [ ] **Staging** end-to-end verification of consent + DSAR + cookie flows
- [ ] **Counsel** sign-off on all `legal/*.md` policy text

---

## Related docs

- `legal/terms-of-service.md`
- `docs/dmca-production.md` (operations)
- `docs/kyc-providers.md` (implementation)
