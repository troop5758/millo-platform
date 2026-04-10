# Support: orders, payments, and tickets (P0 clarity)

## Canonical rule for **payment / order incidents**

1. **User-facing commerce orders** — use **Support** flows tied to **orders** and payment references (`PaymentReference` where written).  
2. **Account / safety / moderation** — use **support tickets** (general queue).  
3. If a case spans both (e.g. “charged but order missing”), **support owns triage**: open or link a **commerce/order** investigation first; escalate to **payments engineering** using internal payment search (`docs/PAYMENT-LOOKUP-SCOPE.md`).

## Model note

The codebase may expose both **Ticket** and **SupportTicket**-style paths over time. Until a full merge, **do not** assume they share the same schema. Runbook default: use the route your deployed **admin/support UI** writes to, and document the mapping in your internal wiki.

### ID glossary (ops)

| ID | Meaning |
|----|---------|
| **Mongo `_id`** (`Ticket` or `SupportTicket`) | Primary key for staff APIs such as `POST /dashboards/support/tickets/:id/respond`. |
| **`ticketNumber` / `trackingId`** (`SupportTicket`) | Public tracking value; `GET /ticket/:trackingId` resolves either field. Staff-created tickets from `/dashboards/support/tickets` set both to the same `MIL-…` value. |
| **`orderId`** (`SupportTicket`) | Linked shop order when the channel is order-related; not the same as a ticket `_id`. |

## Launch posture

Until models are unified, **acceptable** if:

- Operators have a **written** rule (this doc), and  
- Admin/support tooling clearly labels **order ID vs ticket ID**.

https://milloapp.com
