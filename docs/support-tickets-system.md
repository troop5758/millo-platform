# Support Tickets System (Order Issues & Tracking)

Users submit support requests tied to orders (tracking, issue type). Admins view, resolve, verify tracking, and trigger refunds/disputes. This doc maps your design to Millo and outlines schema/API extensions.

---

## System overview (Millo-compatible)

**Users can:**

- Submit a support request with **Order ID**, **tracking number**, **issue type** (not delivered, wrong item, damaged, other).
- Track ticket status in real time (open → in review → resolved/rejected).

**Admins can:**

- View, filter, and resolve tickets.
- Verify tracking (via carrier API or webhooks).
- Trigger refunds, open disputes, apply penalties (all logged to AdminAuditLog / FinancialAuditLog).

---

## Architecture

| Layer | Millo stack |
|-------|-------------|
| **Frontend** | React: Support Form Page, Ticket Status Page, Order Page “Report Issue” CTA |
| **Backend** | Fastify (Node.js) in `packages/api`: support routes + dispute routes + dashboards |
| **Database** | MongoDB: `SupportTicket` (order/tracking fields), legacy `Ticket` (generic Phase-10), `Dispute`, optional `TrackingEvent` |
| **Integrations** | Shippo / EasyPost / AfterShip (tracking), `@millo/notifications` (email), webhooks for tracking updates |

---

## Current state in Millo

- **SupportTicket** schema (`packages/database/src/schemas/SupportTicket.js`) — **canonical for order issues**: `orderId`, `trackingNumber`, `carrier`, `issueType`, `description`, `trackingStatus`, `adminNotes`, `ticketNumber` / `trackingId`, SLA fields, `status`, etc.
- **Ticket** schema (`packages/database/src/schemas/Ticket.js`) — legacy/generic Phase-10 shape: `userId`, `subject`, `message`, `status`, `assignedTo`, `messages`, `meta` (no first-class order/tracking fields).
- **Dispute** schema: `transactionId`, `userId`, `reason`, `status` (open | investigating | resolved), `resolvedBy`, `resolvedAt`, `resolutionNote`, `meta`.
- **User/API**: `POST /support`, `GET /support/my`, `PATCH /support/:id` operate on **SupportTicket** (see § Implemented below).
- **Dashboards**: `POST/GET /dashboards/support/tickets` (create/list, support/admin role), `POST /dashboards/support/refund`, payment lookup, user tools. All admin actions go through `writeAdminAuditLog`.

So: order-linked support and tracking live on **SupportTicket**; **Ticket** remains for generic/legacy tickets unless migrated.

---

## Recommended schema extension (order support tickets)

Either extend **Ticket** or add a dedicated **SupportTicket** (or **OrderSupportTicket**) so order issues and tracking are first-class.

**Option A — extend Ticket with optional order fields**

Add to existing `Ticket` schema:

- `orderId` — ref Order (optional).
- `trackingNumber`, `carrier` — string (optional).
- `issueType` — enum: `NOT_DELIVERED`, `DAMAGED`, `WRONG_ITEM`, `OTHER` (optional).
- `description` — string (optional).
- `trackingStatus` — enum: `PENDING`, `IN_TRANSIT`, `DELIVERED`, `FAILED` (optional, can be synced from carrier).
- `adminNotes` — string (optional).

Keep `status` as is (open | in_progress | resolved | closed); “rejected” can be represented as `status: 'closed'` + `meta.resolution: 'rejected'` or add an enum value.

**Option B — dedicated SupportTicket model (your shape)**

- New schema `SupportTicket` with: `userId`, `orderId`, `trackingNumber`, `carrier`, `issueType`, `description`, `status` (OPEN | IN_REVIEW | RESOLVED | REJECTED), `trackingStatus`, `adminNotes`, timestamps.
- Link to `Dispute` when admin opens a dispute: `meta.disputeId` or `SupportTicket` holds `disputeId`.

Both options are Millo-compatible; B gives a clean separation between “generic” Ticket and “order/fulfillment” support.

---

## API (aligned with your flow)

**User-facing (auth):**

- `POST /support/tickets` — create ticket: body `{ orderId, trackingNumber?, carrier?, issueType, description? }`. Validate order belongs to user. Create Ticket (or SupportTicket) with status OPEN. Optionally notify support queue.
- `GET /support/tickets` — list current user’s tickets (filter by status, orderId).
- `GET /support/tickets/:id` — ticket detail + status (real-time = poll or expose via same resource).

**Order page “Report Issue”:**

- Same `POST /support/tickets` with `orderId` (and prefill tracking if available from order meta).

**Admin (dashboards, support role):**

- `GET /dashboards/support/tickets` — list all (filter by status, userId, orderId); already partially there.
- `PATCH /dashboards/support/tickets/:id` — update status, adminNotes, assign; optionally create/link Dispute, trigger refund (existing refund flow + audit log).

**Tracking:**

- `tracking.service.js` (or equivalent): given `trackingNumber` + `carrier`, call Shippo/EasyPost/AfterShip; update `trackingStatus` on the ticket and optionally store `TrackingEvent` docs for history. Webhooks from carrier can push updates and update ticket + notify user.

---

## Integrations

- **Shippo / EasyPost / AfterShip**: track by number + carrier; optional webhooks to update `trackingStatus` and ticket.
- **Email**: `@millo/notifications` for “Ticket received”, “Status updated”, “Resolved”.
- **Refunds / disputes**: use existing `Dispute` and payout/refund flows; admin “Resolve” can set ticket status and create refund or dispute with `writeAdminAuditLog` and `FinancialAuditLog` where applicable.

---

## Summary

| Your concept | Millo today | Action |
|--------------|-------------|--------|
| support_tickets | SupportTicket (order fields) + legacy Ticket | Use SupportTicket for new order flows; optional: migrate or bridge old Ticket docs |
| tracking_events | — | Optional TrackingEvent collection + tracking.service + webhooks |
| disputes | Dispute | Already exists; link from ticket resolution |
| User submit | — | Add POST /support/tickets (auth) |
| User track status | — | GET /support/tickets, GET /support/tickets/:id |
| Admin view/resolve | Dashboards support/tickets | Extend list + PATCH resolve, link refund/dispute |
| Verify tracking | — | tracking.service + carrier API + webhooks |
| Trigger refunds | Dashboards support/refund | Already exists; call from ticket resolve flow |

This keeps the system overview you described (submit → track → admin resolve → refunds/disputes) and fits the Millo vision: Fastify API, Mongo, existing Ticket/Dispute and audit logs, with optional tracking and notifications.

---

## Implemented (Millo codebase)

### API

- **POST /support** — create SupportTicket (auth); body: `orderId`, `trackingNumber`, `carrier`, `issueType`, `description`. If trackingNumber+carrier present, a **tracking-support** BullMQ job is enqueued.
- **GET /support/my** — list current user's SupportTickets (auth), sorted by `createdAt` desc.
- **PATCH /support/:id** — admin/support only: update `status`, `adminNotes`, `trackingStatus`. Writes to AdminAuditLog. If `trackingStatus === 'DELIVERED'` and `issueType === 'NOT_DELIVERED'`, calls **flagSupportFraud** (FraudEvent, eventType `support_fraud`, action `review`).

### Tracking verification

- **services/tracking.service.js** — `verifyTracking(trackingNumber, carrier)` using AfterShip API (`AFTERSHIP_API_KEY`). Returns `{ status, lastUpdate }`; status mapped to PENDING | IN_TRANSIT | DELIVERED | FAILED.
- **lib/trackingQueue.js** — BullMQ queue `tracking-support`; jobs added when a ticket is created with tracking info.
- **@millo/workers** — **trackingSupport.worker.js** processes `tracking-support` jobs: loads SupportTicket, calls `verifyTracking`, updates `ticket.trackingStatus`, saves; if DELIVERED + issueType NOT_DELIVERED, calls **flagSupportFraud**.

### Anti-fraud

- **fraudService.flagSupportFraud(userId, reason, meta)** — creates FraudEvent (`eventType: 'support_fraud'`, `action: 'review'`, `refType: 'support_ticket'`). Used when tracking shows DELIVERED but user claimed NOT_DELIVERED (POTENTIAL_FALSE_CLAIM).

### React UI

- **SupportFormPage** (`/support/request`) — form: order ID, tracking number, carrier, issue type, description; submits to POST /support (auth). ProtectedRoute.
- **SupportMyTicketsPage** (`/support/my`) — lists user's tickets (GET /support/my). ProtectedRoute.
- **dashboardsApi.supportTicketUpdate(staffUser, ticketId, body)** — PATCH /support/:id for admin/support dashboard.

### Smart automation (reference)

| Condition | Action (implemented or recommended) |
|-----------|-------------------------------------|
| Delivered but user claims not received | **Implemented**: flagSupportFraud (FraudEvent, review). |
| No tracking submitted | Block seller payout: use existing payout-hold / creator-fraud logic; optional gate on order fulfillment. |
| Tracking invalid | Auto-escalate: optional — set status IN_REVIEW or add adminNotes from tracking.service error. |
| Not delivered after X days | Auto refund trigger: optional — cron or job that checks ticket age + trackingStatus and creates refund/dispute. |

### Environment

- **AFTERSHIP_API_KEY** — optional; if set, tracking.service and tracking worker will call AfterShip. If unset, verifyTracking returns status PENDING.
- **REDIS_HOST / REDIS_PORT** — for BullMQ (tracking-support queue and worker).
