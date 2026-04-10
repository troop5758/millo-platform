# Support System Overview — TikTok/Amazon-Level (Millo)

Production-grade support: tracking numbers, real-time chat, admin-controlled agents, SLA + routing, audit + compliance.

---

## 1. System flow

```
User → Creates Ticket → Gets Tracking ID (e.g. MILLO-100001)
        ↓
   Assigned to Support Agent (auto-routing or manual)
        ↓
 Real-time Chat (WebSocket /user/ws + REST fallback)
        ↓
 Status updates + SLA tracking (first response, resolve by)
        ↓
 Notifications (email + in-app)
```

---

## 2. Features

| Feature | Implementation |
|--------|----------------|
| **Ticket tracking numbers** | `SupportTicket.ticketNumber` (MILLO-100001, atomic `Counter`) |
| **Real-time live chat** | WebSocket `support_message` on `/user/ws`; REST `POST /support/:id/messages`; push to customer + assigned agent(s) |
| **Admin-controlled agents** | Admin UI: create support account, list agents, disable/enable, assign permissions; RBAC enforced |
| **SLA + routing** | `slaRespondBy` / `slaResolveBy` (env: `SUPPORT_SLA_RESPOND_HOURS`, `SUPPORT_SLA_RESOLVE_HOURS`); auto-assign to agent with fewest open tickets |
| **Audit + compliance** | All staff actions and ticket updates logged to `AdminAuditLog`; message send from staff logged |

---

## 3. Data model

- **SupportTicket**: `userId`, `ticketNumber`, `orderId`, `trackingNumber`, `carrier`, `issueType`, `description`, `channel` (order_issue | general), `status`, `trackingStatus`, `adminNotes`, `assignedTo`, `assignedAt`, `slaRespondBy`, `slaResolveBy`, `firstResponseAt`, `priority`.
- **SupportTicketMessage**: `ticketId`, `userId`, `fromRole` (user | support | system), `body`, timestamps.
- **Counter**: `support_ticket_seq` for atomic ticket numbers.

---

## 4. API (REST)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /support | user | Create ticket; returns `ticketNumber`, SLA set, optional auto-assign |
| GET | /support/my | user | List current user's tickets |
| GET | /support/queue | support/admin | List tickets (filters: status, assignedTo) |
| GET | /support/:id | user or staff | Get one ticket |
| GET | /support/:id/messages | user or staff | List messages (paginated) |
| POST | /support/:id/messages | user or staff | Send message (body: `{ body }`) |
| PATCH | /support/:id | support/admin | Update status, adminNotes, trackingStatus, assignedTo, priority, slaRespondBy, slaResolveBy |

---

## 5. Real-time (WebSocket)

- **Connect**: `GET /user/ws?token=<session_token>`
- **Send message**: `{ type: 'support_message', data: { ticketId, body } }`
- **Server → client**: `{ type: 'support_message', data: { ticketId, message } }`, `{ type: 'support_ticket_updated', data: { ticketId, ticket } }`, `support_message_sent`, `support_message_error`

---

## 6. Notifications

- **support_ticket_created** — user (confirmation + ticketNumber)
- **support_new_ticket** — support agents (new ticket)
- **support_ticket_assigned** — user (agent assigned)
- **support_ticket_assigned_to_you** — agent (ticket assigned to them)
- **support_new_message** — other party (new message in thread)

---

## 7. Env (optional)

- `SUPPORT_SLA_RESPOND_HOURS` — default 24
- `SUPPORT_SLA_RESOLVE_HOURS` — default 72

---

## 8. Cursor-ready

- Schemas: `packages/database/src/schemas/SupportTicket.js`, `SupportTicketMessage.js`, `Counter.js`
- API: `packages/api/src/routes/support.js`, `services/supportTicketService.js`, `lib/supportChatHandler.js`
- WS: `packages/api/src/routes/userWs.js` (support_message)
- Admin UI: Support Management (create agents, list, disable/enable, audit logs, permissions)
