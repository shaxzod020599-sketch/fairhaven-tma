# Uzum connection handoff — 2026-09-08

Status: one dedicated OAuth credential pair created and registered. This is credential provisioning, not production activation or partner acceptance.

| Field | Value |
| --- | --- |
| Host | https://api.fairhaven.uz/uzum |
| Client ID | fhu_id_99be68fa7282def81d6c87ce |
| Place | 6d2c8ecc-e818-4812-9b34-146c6f312f56 |
| Client secret | Stored only in encrypted vault profile `fairhaven_uzum`, variable `UZUM_CONNECTION_JSON`; not included in Git or this document. |

FairHaven owns these identifiers. The generated Place is saved in the encrypted connection bundle; it has not been installed as the runtime store mapping. Do not send this document as a claim that the API is active.

## Verified provisioning

The approved one-shot operation completed successfully. Before import, read-only verification found no records for the new client. Exactly one import was attempted. The subsequent read-only check found exactly one active matching credential; Medicalka credential metadata remained unchanged. No prior key was revoked or replaced. No secret value was returned to the assistant, placed in command arguments, written to an environment file, or committed.

Production remains at f5dd07d. Backend and channel environment checksums, plus the pre-existing modified admin lockfile checksum, remain unchanged. Neither service was restarted. The existing untracked channel environment backup was preserved.

## Remaining launch gates

- Securely deliver the secret to the named Uzum contact through an operator-approved destination. It has not been sent to anyone.
- Configure the runtime store mapping and independent signing key, then activate the Uzum channel under a separate controlled release. They were not changed by credential provisioning.
- Select and validate actual products, channel prices and fiscal data; confirm the partner's Place mapping and acceptance checks.
- Keep `BILLZ_WRITE_ENABLED=false` unless the operator separately approves real accounting activation. No live order, payment, stock deduction or Telegram test was performed.

The Mac vault's approved `cmd_add` transport fix uses stdin rather than a value-bearing SOPS argument. A separate exposure in the existing `cmd_run` path is not repaired by that narrow change. Do not retrieve this bundle through the current `ai-secret run` path. Agent-mediated retrieval/delivery needs a separately reviewed mechanism; the owner can use the vault's existing interactive interface outside agent transcripts. Do not regenerate the pair or repeat provisioning.
