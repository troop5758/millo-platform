# Backup & recovery

Recovery targets and procedures are **your** RPO/RTO; this doc states a **baseline strategy** compatible with Millo (MongoDB, object storage, optional Redis). Automate backups via your cloud provider or scheduler—**do not** rely on manual copies for production alone.  
https://milloapp.com

---

## Backup strategy

| Asset | Recommendation | Notes |
|-------|------------------|--------|
| **Database (MongoDB)** | **Daily snapshots** (managed service preferred: point-in-time restore, cross-region replica) | Millo data lives in Mongo (`@millo/database`). Test restores **quarterly**. |
| **Object storage (S3-compatible)** | **Versioning enabled** + lifecycle rules (noncurrent versions, abort incomplete multipart) | Media, exports, and provider artifacts—**accidental delete** and **ransomware-style overwrites** are easier to recover with versioning + IAM scoping. |
| **Redis** | **Optional** snapshot (RDB) / AOF only if you treat Redis as **durable** | Many deployments use Redis for **cache, rate limits, and ephemeral feed keys**—loss may be **acceptable** vs DB; confirm your use (BullMQ job state may matter—treat as operational data with its own policy). |
| **Secrets** | Stored in **secret manager** / KMS—not only in DB backups | Rotations documented in deploy runbooks. |

---

## Restore (examples)

**Replace connection strings, paths, and auth with your environment.** Take the API **offline** or **read-only** during a full restore if required to avoid split-brain writes.

### MongoDB — `mongorestore` (directory dump)

```bash
# Example: restore from a directory produced by mongodump
mongorestore --uri="mongodb://USER:PASS@HOST:27017" --drop backup/

# Prefer --nsInclude / --nsExclude to limit blast radius when restoring a subset
# mongorestore --uri="..." --nsInclude='millo.*' backup/
```

- Use **`mongodump` / `mongorestore`** versions compatible with your server.
- **`--drop`** drops existing collections before restore—**destructive**; use only in controlled recovery.
- **Managed Atlas**: prefer **Cloud UI / API restore** from snapshot for full-cluster recovery; use `mongorestore` for **partial** or **cross-environment** copies.

### Object storage

- Restore a **version** or **replicate back** from versioned bucket; verify **bucket policy** and **CORS** after restore.

### Redis

- If using snapshots: stop writers, replace RDB (or follow your vendor’s restore), restart—**invalidate** or **warm** caches as needed.

---

## Verification after restore

- Run **application health checks**, **smoke tests** (auth, feed read, payment **sandbox** flow if applicable).
- Reconcile **financial** and **audit** expectations with legal/ops (no silent gaps).
- Update **`docs/INCIDENT-POSTMORTEM-TEMPLATE.md`** if recovery followed an incident.

---

## Related

- **`docs/RUNBOOK-ONCALL-MINIMUM.md`** — incident playbook.
- **`docs/data-storage-layer.md`** — storage overview (if present in your tree).
