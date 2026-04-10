# Backup encryption

- **MongoDB**: Use `mongodump` with `--gzip` and encrypt the output (e.g. GPG or AES) before uploading to S3 or backup storage. Example: `mongodump --archive | gzip | gpg -c -o backup.asc`.
- **PostgreSQL**: `pg_dump` output piped through `gpg --symmetric` or equivalent.
- **Secrets**: Store backup passphrase in a secrets manager; never in plaintext in scripts.
- **At-rest**: Prefer backup storage that supports encryption at rest (S3 SSE, etc.).

https://milloapp.com
