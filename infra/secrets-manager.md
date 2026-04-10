# Secrets manager

- **No hardcoded secrets** in code. Use environment variables or a secrets manager (e.g. AWS Secrets Manager, HashiCorp Vault).
- **@millo/security** exposes `getSecret(name)` / `getSecretRequired(name)`; wire to `process.env` or to a provider (set `SECRETS_PROVIDER=vault` and implement fetch).
- **Rotation**: Rotate DB credentials, API keys, and TURN secrets on a schedule; update env or vault and restart app (rolling restart).
- **Least privilege**: DB and service accounts with minimal required permissions.

https://milloapp.com
