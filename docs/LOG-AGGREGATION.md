# Log Aggregation — Millo Platform

**Production observability.** https://milloapp.com

## Options

### 1. PM2 Logs (Default)

PM2 writes stdout/stderr to `~/.pm2/logs/`:

- `millo-api-out.log`, `millo-api-error.log`
- `millo-workers-out.log`, `millo-workers-error.log`

View: `pm2 logs` or `pm2 logs millo-api --lines 100`

### 2. Logrotate

Configured via `infra/logrotate-millo.conf`:

```bash
sudo cp infra/logrotate-millo.conf /etc/logrotate.d/millo
```

Rotates PM2 logs daily; keeps 7 days.

### 3. Centralized Logging (Optional)

For production at scale, consider:

| Service | Purpose |
|---------|---------|
| **Loki** | Log aggregation (Grafana Labs) |
| **Elasticsearch + Kibana** | Full-text search, dashboards |
| **Datadog** | Logs + APM + metrics |
| **CloudWatch** | AWS-native logs |

### 4. Pino (API Logger)

The API uses Pino. Set `LOG_LEVEL=debug` for verbose output. For JSON logs:

```bash
LOG_LEVEL=info node packages/api/src/index.js 2>&1 | pino-pretty
```

Or pipe to a log shipper (e.g. Filebeat, Fluentd) for aggregation.

### 5. Quick Setup: Loki + Promtail

```yaml
# docker-compose addition for logs
  promtail:
    image: grafana/promtail:2.9.0
    volumes:
      - ./promtail-config.yml:/etc/promtail/config.yml:ro
      - /var/log:/var/log:ro
```

Configure Promtail to scrape PM2 log paths and send to Loki. Add Loki as a Grafana datasource.

**MILLO ENTERPRISE PLATFORM — https://milloapp.com**
