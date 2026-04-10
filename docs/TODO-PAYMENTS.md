# TODO — PAYMENTS

## Current reality

### Implemented with caveat

- `GET /payments/search?reference=`
- `GET /payments/reference/:ref`

Coverage depends on `PaymentReference`.

### Still partial

- provider mode in JSON is not consistent everywhere
- Stripe/PayPal/Wise stub/provider-off behavior still exists

### Still missing

- universal lookup across every money record and processor ID

## Next hardening tasks

- [ ] audit where searchable references are written
- [ ] improve reference coverage only where justified
- [ ] expose provider mode more consistently where UI depends on it
- [ ] keep money UX explicit about stub vs live behavior

## Do not overclaim

- current reference search is not universal search
