# Global load balancing

**Production:** https://milloapp.com  
**API host:** `api.milloapp.com`

## Layers (outside → inside)

| Layer | Role |
|-------|------|
| **1. DNS (Geo / latency)** | Send users to the **nearest healthy** regional entry (Cloudflare LB, Route 53 latency records, etc.). |
| **2. L7 load balancer** | Regional **ALB / NLB / GLB** (cloud) or Cloudflare → **Kubernetes Ingress**; TLS termination may live here or at Ingress. |
| **3. NGINX Ingress Controller** | In-cluster **Ingress** resource routes `Host` + path to **Services** (`millo-api`, streaming, etc.). |

DNS and geo routing: **`infra/multi-region-geo-routing.md`**.

---

## NGINX Ingress — `infra/k8s/ingress.yaml`

Manifest: **`infra/k8s/ingress.yaml`** (`metadata.name: millo-ingress`, `namespace: millo`).

- **Class:** `kubernetes.io/ingress.class: nginx` (ingress-nginx) or migrate to `spec.ingressClassName` per your cluster version.
- **TLS:** `cert-manager` issuer + `millo-tls` secret for `milloapp.com`, `api.milloapp.com`, `cdn.milloapp.com`, `hls.milloapp.com`.
- **API rule:** `host: api.milloapp.com` → Service **`millo-api`** on **port 80** (the Service’s `port`, which forwards to the pod `targetPort`).

Minimal shape (subset of the full file):

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: millo-ingress
  namespace: millo
spec:
  rules:
    - host: api.milloapp.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: millo-api
                port:
                  number: 80
```

The repo file adds **TLS**, **annotations** (body size, SSL redirect), and **hls.milloapp.com** routing.

---

## Service port vs pod port

`Ingress.spec.rules[].backend.service.port.number` must match a **`port`** on the **Service** (`millo-api`), not necessarily the container port. Example Service:

```yaml
ports:
  - name: http
    port: 80
    targetPort: 3000   # or 5000 if your Deployment uses PORT=5000
```

Use **80** on the Ingress when the Service exposes HTTP on `port: 80`.

---

## WebSockets / long-lived connections

Live chat and similar paths need **proxy read timeouts** on NGINX Ingress (extend `proxy-read-timeout` via annotations where required). Millo API uses WebSockets on chat routes.

---

## Related

| File | Topic |
|------|--------|
| `infra/k8s/api-deployment.yaml` | API Deployment + Service |
| `infra/multi-region-geo-routing.md` | Geo DNS in front of regional LBs |
| `infra/nginx/milloapp.com.conf.template` | VM-style nginx (non-K8s) |
