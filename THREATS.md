# LedgerLine – Threat Model

Running list of threats and how each one is handled. Updated as features are built.

| # | Threat | Mitigation | Status |
|---|--------|------------|--------|
| 1 | Secrets (DB password, JWT secret) leaked via Git | `.env` is in `.gitignore`; only `.env.example` with placeholders is committed | Done (Task 1) |
| 2 | Server starts with weak or missing config | Env vars validated with Zod at startup; `JWT_SECRET` must be ≥ 32 chars | Done (Task 1) |
| 3 | Internal error details leaked to clients | Central error handler returns generic message for unknown errors | Done (Task 1) |
| 4 | Brute force / request flooding | Global rate limit on `/api` (100 req / 15 min / IP) | Basic (Task 1) – stricter auth limits in Task 3 |
| 5 | Common HTTP header attacks (clickjacking, MIME sniffing) | Helmet security headers | Done (Task 1) |
| 6 | Large request bodies used for DoS | JSON body limit of 10 KB | Done (Task 1) |
| 7 | Cross-origin calls from untrusted websites | CORS restricted to `CORS_ORIGIN` | Done (Task 1) |
| 8 | Password theft from database | bcrypt hashing | Planned (Task 3) |
| 9 | Users accessing other users' accounts | Ownership checks on backend | Planned (Task 4) |
| 10 | Negative balances / partial transfers | DB CHECK constraint `balance >= 0` on customer accounts (Task 2); DB transactions + row locks (Task 6) | Partly done |
| 11 | Duplicate payments from retried requests | Idempotency keys | Planned (Day 2) |
| 12 | Race conditions on concurrent transfers | Consistent lock ordering + concurrency tests | Planned (Task 6 / Day 2) |
| 13 | Ledger history tampered with (edit/delete entries) | PostgreSQL triggers block UPDATE/DELETE on `ledger_entries` and `audit_logs` | Done (Task 2) |
| 14 | Invalid money values (0, negative, self-transfer) reach the DB | CHECK constraints: amount > 0, from ≠ to | Done (Task 2) |
| 15 | Floating-point rounding errors on money | All amounts stored as BigInt paise | Done (Task 2) |
| 16 | App compromise gives full DB control | App connects as dedicated `ledgerline_app` role, not the superuser | Done (Task 2) |
