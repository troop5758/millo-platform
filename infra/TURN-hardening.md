# TURN hardening — WebRTC TURN server security

- Run TURN over **TLS only** (e.g. port 5349).
- Use **short-lived credentials** (TURN REST API or time-limited secret); avoid long-lived shared secrets.
- **Rate limit** TURN allocations per client/IP to mitigate abuse.
- **Bind to internal/private IP** where possible; expose only through reverse proxy with DDoS limits.
- **Audit** allocation usage; alert on anomalous traffic.

https://milloapp.com
