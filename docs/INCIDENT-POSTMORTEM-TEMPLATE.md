# Incident postmortem template

Copy this file for each incident or paste the sections into your ticketing/wiki system.  
**Mandatory** for material incidents (see `docs/RUNBOOK-ONCALL-MINIMUM.md` § 7).  
Link **financial mutations** and **admin overrides** to audit records where applicable (Millo system rules).  
https://milloapp.com

---

## Incident summary

What happened?

## Impact

Users affected? Revenue impact? Duration of degraded SLOs?

## Root cause

Technical explanation (facts, not blame).

## Timeline

- HH:MM (TZ) — detected
- HH:MM — triaged
- HH:MM — contained / mitigated
- HH:MM — resolved
- HH:MM — communications sent (internal / external)

## Resolution

What fixed it? (deploy hash, config change, provider fix, rollback ID, etc.)

## Action items

| Item | Owner | Due | Done |
|------|-------|-----|------|
| Add or tune alert | | | ☐ |
| Fix code path | | | ☐ |
| Improve monitoring / dashboard | | | ☐ |
| Update runbook | | | ☐ |

(Add rows as needed.)

## Lessons learned

What will we do differently next time?

See also **`docs/CONTINUOUS-IMPROVEMENT.md`** (alert + dashboard + root-cause loop).
