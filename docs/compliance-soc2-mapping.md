# SOC2 Mapping — Millo 3.0

Control mapping for SOC 2 (Trust Services Criteria). https://milloapp.com

| Control area | Implementation | Location |
|--------------|----------------|----------|
| **CC6.1** Logical access | Role-based access (admin/mod/support) | `@millo/dashboards` roles.js; API 403 for forbidden |
| **CC6.2** Prior to issuance | Admin override and financial ops logged | AdminAuditLog; financial mutations in FinancialAuditLog |
| **CC6.3** Authorization | RBAC enforced on all dashboard actions | packages/dashboards/src/roles.js |
| **CC6.6** Security events | Audit logging (AuditLog, AdminAuditLog, ModerationLog) | packages/database schemas; packages/dashboards admin/mod/support |
| **CC6.7** Transmission / disposal | TLS (https://milloapp.com); no PII in logs by default | Infra / config |
| **CC7.1** Detection of security events | Audit logs, financial audit, admin audit | AuditLog, FinancialAuditLog, AdminAuditLog |
| **CC7.2** Monitoring | Logging of overrides and financial mutations | All phases; deploy/monitoring via infra |
| **CC7.3** Response to identified incidents | Kill-switches (ads, MILLA, filters); moderation | packages/ads, packages/milla, packages/live |
| **CC8.1** Change management | No automated change; deploy via script | scripts/deploy.js |
| **PI1.1** Collection limitation | Consent logging; purpose and version | packages/compliance consent.js; ConsentLog schema |
| **PI1.2** Data subject access | DSAR export of personal data | packages/compliance dsar.js |
| **PI2.1** Confidentiality | Access restricted by role; session token hashing | Session.tokenHash; RBAC |
| **PI3.1** Disposal / return | DSAR supports data portability; retention via policy | docs; operational |

*This mapping is for reference. Formal SOC 2 audit is separate.*
