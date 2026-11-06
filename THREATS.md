# LedgerLine – Threat Model

Running list of threats and how each one is handled. Updated as features are built.

| # | Threat | Mitigation | Status |
|---|--------|------------|--------|
| 1 | Secrets (DB password, JWT secret) leaked via Git | `.env` is in `.gitignore`; only `.env.example` with placeholders is committed | Done (Task 1) |
| 2 | Server starts with weak or missing config | Env vars validated with Zod at startup; `JWT_SECRET` must be ≥ 32 chars | Done (Task 1) |
| 3 | Internal error details leaked to clients | Central error handler returns generic message for unknown errors | Done (Task 1) |
| 4 | Brute force / request flooding | Global limit 100 req / 15 min; login 10 failed / 15 min; register 10 / hour (per IP, in-memory) | Done (Task 3) – in-memory only |
| 5 | Common HTTP header attacks (clickjacking, MIME sniffing) | Helmet security headers | Done (Task 1) |
| 6 | Large request bodies used for DoS | JSON body limit of 10 KB | Done (Task 1) |
| 7 | Cross-origin calls from untrusted websites | CORS restricted to `CORS_ORIGIN` | Done (Task 1) |
| 8 | Password theft from database | bcrypt (cost 12); hash never returned by API; max 72 bytes enforced | Done (Task 3) |
| 9 | Users accessing other users' accounts | `canAccessAccount` ownership check on the backend, refusals audited; unit tested | Done (Task 4) – wired to endpoints in Task 5/6 |
| 10 | Negative balances / partial transfers | DB CHECK constraint `balance >= 0` on customer accounts (Task 2); DB transactions + row locks (Task 6) | Partly done |
| 11 | Duplicate payments from retried requests | Idempotency keys | Planned (Day 2) |
| 12 | Race conditions on concurrent transfers | Consistent lock ordering + concurrency tests | Planned (Task 6 / Day 2) |
| 13 | Ledger history tampered with (edit/delete entries) | PostgreSQL triggers block UPDATE/DELETE on `ledger_entries` and `audit_logs` | Done (Task 2) |
| 14 | Invalid money values (0, negative, self-transfer) reach the DB | CHECK constraints: amount > 0, from ≠ to | Done (Task 2) |
| 15 | Floating-point rounding errors on money | All amounts stored as BigInt paise | Done (Task 2) |
| 16 | App compromise gives full DB control | App connects as dedicated `ledgerline_app` role, not the superuser | Done (Task 2) |
| 17 | Self-registration as ADMIN (mass assignment) | Zod `strictObject` rejects unknown fields; role hard-coded to ACCOUNT_HOLDER | Done (Task 3) |
| 18 | Forged / tampered JWT, `alg: none` attack | HS256 pinned, issuer + audience verified, ≥32-char secret | Done (Task 3) |
| 19 | Email enumeration via login | Same error message for all failures; dummy bcrypt compare for unknown emails | Done (Task 3) |
| 20 | Stale role / deactivated user still using old token | User re-loaded from DB on every authenticated request | Done (Task 3) |
| 21 | Stolen token used until expiry | Short 1h expiry; no refresh/revocation yet | Partial – revocation not implemented |
| 22 | Privilege escalation (holder calls admin/audit APIs) | Central permission matrix + `requirePermission` on every protected route; refusals audited | Done (Task 4) |
| 23 | Admin/auditor moving money (insider fraud) | `transactions:create` and `MOVE_MONEY` granted to ACCOUNT_HOLDER only | Done (Task 4) |
| 24 | Admin locks themselves out / hides own actions | Admin cannot change own status; all admin actions audited | Done (Task 4) |
| 25 | Hard-coded admin credentials in code | ADMIN/AUDITOR created by seed from `.env` only | Done (Task 4) |
