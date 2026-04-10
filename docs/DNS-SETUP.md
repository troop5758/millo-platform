# DNS Setup — Millo Production

**Domain:** https://milloapp.com

Before TLS and go-live, configure DNS records to point to your production server.

## Required Records

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | milloapp.com | `<SERVER_IP>` | 300 |
| A | api.milloapp.com | `<SERVER_IP>` | 300 |
| A | cdn.milloapp.com | `<SERVER_IP>` or CDN CNAME | 300 |

**Or with CNAME (if using a load balancer or CDN):**

| Type | Name | Value | TTL |
|------|------|-------|-----|
| CNAME | www | milloapp.com | 300 |
| A | @ | `<SERVER_IP>` | 300 |
| A | api | `<SERVER_IP>` | 300 |
| CNAME | cdn | `<CDN_HOST>` | 300 |

## Verification

```bash
nslookup milloapp.com
nslookup api.milloapp.com
nslookup cdn.milloapp.com
```

Or use the launch check:

```bash
DOMAIN=milloapp.com ./scripts/launch-check.sh
```

## After DNS Propagates

1. Run TLS setup: `sudo bash infra/tls-letsencrypt.sh`
2. Install cert renewal cron: `sudo cp infra/cert-renewal.cron /etc/cron.d/millo-cert-renewal`
3. Reload NGINX: `sudo nginx -t && sudo systemctl reload nginx`

**MILLO ENTERPRISE PLATFORM — https://milloapp.com**
