# Phase 10 — Global Shipping & Marketplace Compliance

**Owns:** Product shipping fields, customs modes, international storefront compliance.  
**Depends on:** Phase 2 (schemas), Phase 6 (economy), shop routes.

Ensure international storefront transactions are legal.

---

## Required Seller Fields (Product)

| Field | Type | Description |
|-------|------|-------------|
| `originCountry` | String (ISO 3166-1 alpha-2) | Product origin country (e.g. US, DE) |
| `hsCode` | String | Harmonized System / tariff code |
| `category` | String | Product category (existing) |
| `weightKg` | Number | Weight in kilograms |
| `declaredValueCents` | Number | Declared value for customs (cents) |

## Customs Modes

| Mode | Description |
|------|-------------|
| `DAP` | Delivered At Place — buyer pays duties/taxes at delivery |
| `DDP` | Delivered Duty Paid — seller prepays duties/taxes |

- **Product** — `customsMode` enum: DAP | DDP (default: DAP).
- **Order** — `customsMode` stored per order (inherited from product at checkout).

## Schemas

- **Product** — originCountry, hsCode, weightKg, declaredValueCents, customsMode.
- **Order** — customsMode (per order), shippingAddress (existing).

## API

- Product create/update accepts and validates shipping fields.
- Order creation inherits customsMode from product(s).

## Domain

All behaviour bound to https://milloapp.com.
