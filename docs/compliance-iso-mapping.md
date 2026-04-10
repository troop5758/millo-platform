# ISO Mapping — Millo 3.0

Control mapping for ISO/IEC 27001 (and related). https://milloapp.com

| ISO 27001 control | Implementation | Location |
|-------------------|----------------|----------|
| **A.5.1** Policies for information security | Project rules and MasterPrompt | .cursor/rules; docs/MasterPrompt-v2.0.md |
| **A.5.2** Information security roles | RBAC (admin, mod, support) | packages/dashboards roles.js |
| **A.8.1** Inventory of assets | Schemas and services documented | packages/database; docs |
| **A.8.2** Information classification | PII in User/Profile; financial in Wallet/Ledger | Schemas; DSAR export scope |
| **A.8.5** Secure authentication | Session with tokenHash; no plaintext secrets in DSAR | Session schema; dsar.js excludes tokenHash |
| **A.8.8** Management of technical vulnerabilities | Dependencies; Node 18+ | package.json engines; deploy |
| **A.8.9** Configuration management | Config loader; env-based kill-switches | packages/api config; ADS_ENABLED, MILLA_ENABLED, etc. |
| **A.8.10** Information deletion | DSAR supports data subject rights; deletion via process | compliance package; operational process |
| **A.8.12** Data leakage prevention | Audit of overrides; no logging of secrets | AdminAuditLog; consent logging |
| **A.8.15** Logging | AuditLog, FinancialAuditLog, AdminAuditLog, ModerationLog, ConsentLog | packages/database schemas |
| **A.8.16** Monitoring activities | Logging of financial and admin actions | All phases |
| **A.8.24** Use of cryptography | TLS in production (milloapp.com); token hashing | Infra / Session.tokenHash |
| **A.8.32** Change management | Deploy script; no undocumented services | scripts/deploy.js; millo-system-rules |

*This mapping is for reference. Formal ISO certification is separate.*
