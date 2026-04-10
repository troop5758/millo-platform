# Redis AUTH — Phase 20 security hardening

Redis must be configured with authentication so that only the application (and operators with the password) can access the instance.

- **Enable AUTH:** In `/etc/redis/redis.conf`, set `requirepass` to a strong password. Restart Redis: `systemctl restart redis-server`.
- **Application:** Set `REDIS_PASSWORD` (or the connection URL with the password) in `.env` so the API and workers use the password when connecting.
- **Secrets:** Store the Redis password in a secrets manager or env; never commit to the repo.

https://milloapp.com
