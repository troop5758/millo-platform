# DMCA Production Setup

For full copyright/DMCA compliance and safe harbor under 17 USC § 512, complete the following in production.

## 1. Set designated agent environment variables

In production, set these so the policy page and forms show correct contact details:

- **DMCA_AGENT_NAME** — Full name or title of the designated agent (e.g. "Copyright Agent" or "DMCA Agent, Millo Inc.").
- **DMCA_AGENT_ADDRESS** — Physical mailing address where notices can be sent.
- **DMCA_AGENT_EMAIL** — Email address for receiving DMCA notices (monitored inbox).

Example (replace with your real values):

```bash
DMCA_AGENT_NAME="Copyright Agent, Millo Inc."
DMCA_AGENT_ADDRESS="123 Main St, City, State ZIP"
DMCA_AGENT_EMAIL="dmca@milloapp.com"
```

The API serves the Copyright & DMCA policy at `GET /legal/copyright.html` and agent info at `GET /legal/dmca/agent`. The frontend DMCA form at `/legal/dmca` uses this for display and for submissions to `POST /legal/dmca/takedown-notice` and `POST /legal/dmca/counter-notice`. **POST /legal/dmca-report** is an alias for `POST /legal/dmca/takedown-notice` (same request body and response) for reporting copyright infringement.

## 2. Optional: Register with the U.S. Copyright Office

To strengthen safe harbor, you may register your designated agent with the U.S. Copyright Office’s DMCA Designated Agent Directory:

- Go to [copyright.gov/dmca-directory](https://www.copyright.gov/dmca-directory/).
- Create an account and add your service provider designation.
- List the same agent name, address, and email (and any alternate contact methods you support).

Registration is not strictly required for § 512(c) safe harbor, but it is recommended and often expected by rights holders and legal counsel.

## 3. Repeat infringer policy

- **DMCA_REPEAT_INFRINGER_THRESHOLD** (default: 3) — After this many valid takedowns, a user is treated as a repeat infringer. The admin DMCA view shows a “Repeat infringer” warning when accepting a notice if the content owner is at or above the threshold; admins can then suspend the user (optional enforcement).
- In Admin → DMCA Notices, after “Accept & take down,” if the user is a repeat infringer, use “Suspend user” to enforce your policy, or “Dismiss” to only record the notice.

## 4. Public and admin flows

- **Public:** Users and rights holders use the form at `/legal/dmca` (takedown notice). Logged-in uploaders can submit a counter-notice from the same page.
- **Admin:** In Admin → DMCA, list notices, accept/reject pending notices, restore content after the counter-notice period, and mark “Lawsuit filed” when applicable.
