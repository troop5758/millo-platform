# Mongo AUTH — Phase 20 security hardening

MongoDB must be configured with authentication so that only the application (and authorized users) can access the database.

- **Enable auth:** In `/etc/mongod.conf`, set `security.authorization: enabled`. Restart: `systemctl restart mongod`.
- **Create user:** Connect locally and create an application user with `db.createUser({ user, pwd, roles: [{ role: 'readWrite', db: 'millo' }] })`. Use a strong password.
- **Application:** Set `MONGO_URI` in `.env` with the username and password (e.g. `mongodb://user:pass@localhost:27017/millo`).
- **Secrets:** Store credentials in a secrets manager or env; never commit to the repo.

https://milloapp.com
