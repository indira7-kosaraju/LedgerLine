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
| 9 | Users accessing other users' accounts | `canAccessAccount` ownership check on the backend, refusals audited; unit tested | Done – account endpoints (Task 5), transactions (Task 6) |
| 10 | Negative balances / partial transfers | Single DB transaction per movement, `FOR UPDATE` row locks, balance check on locked row, DB CHECK `balance >= 0`; rollback tested | Done (Task 6) |
| 11 | Duplicate payments from retried requests | Idempotency keys | Planned (Day 2) |
| 12 | Race conditions / deadlocks on concurrent transfers | Locks taken in sorted id order; retry on 40P01/40001; smoke-tested (20 parallel withdrawals, 20 opposite transfers) | Done (Task 6) – formal tests Day 2 |
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
| 26 | Client sets own balance or owner when creating an account | `strictObject` rejects `balance`/`ownerId`; server sets owner = logged-in user, balance = 0 | Done (Task 5) |
| 27 | Guessable account identifiers | UUID primary keys; account numbers from `crypto.randomInt` | Done (Task 5) |
| 28 | Precision loss sending money as JSON numbers | Money sent as string paise + formatted value | Done (Task 5) |
| 29 | Account spam | Max 5 accounts per user | Partial – count-then-insert race possible (Day 2) |
| 30 | Status change racing with a money movement | Status update locks the row (`FOR UPDATE`) in a transaction | Done (Task 5) |
| 31 | Moving money from someone else's account | Ownership checked on the **locked** row inside the transaction (ACCOUNT_HOLDER + owner only) | Done (Task 6) |
| 32 | Malformed amounts (0, negative, decimals, `1e5`, huge) | Zod: integer or digit string → BigInt, > 0; policy limits per operation | Done (Task 6) |
| 33 | Refused attempts leave no trace (rolled back with the transaction) | Refusals audited outside the transaction; validation failures on money routes audited too | Done (Task 6) |
| 34 | Recipient balance leaked to sender | Transfer response only includes the caller's account balance | Done (Task 6) |
| 35 | Ledger silently drifts from balances | `GET /api/ledger/verify` recomputes balances, per-txn balance, running balances, and Σ balances = 0 | Done (Task 6) |
| 36 | Debug info (paths, code) leaked in errors | `NODE_ENV` now defaults to `production`; debug only when explicitly `development` | Done (Task 6) |
| 37 | Duplicate money movement on client retry | Idempotency keys | **Not done – Day 2** |
| 38 | SYSTEM account row is a lock hotspot (all deposits/withdrawals serialize on it) | Accepted for now; could shard SYSTEM accounts later | Known limitation |

| 39 | JWT stolen by XSS from browser storage | Token stored only in an `HttpOnly` cookie; never returned to the browser app's JavaScript | Done (Day 2 Task 2) |
| 40 | CSRF using the session cookie | `SameSite=Strict`; CORS credentials only for the exact frontend origin; cookie-authenticated writes require `X-Requested-With` (403 + audit otherwise) | Done (Day 2 Task 2) |
| 41 | Open redirect after login (`?from=//evil.com`) | Redirect target taken from router state and only accepted if it is an internal path (`/…`, not `//…`) | Done (Day 2 Task 2) |
| 42 | UI shows pages a role shouldn't see | `ProtectedRoute roles={…}` hides them – **UI only**; the backend still enforces every permission | Done (Day 2 Task 2) |
| 43 | Session can't be revoked server-side before expiry | Logout clears the cookie; deactivated users are rejected on the next request; no token denylist | Partial |

> **The system is not claimed to be fully secure.** Idempotency, formal concurrency tests and automated adversarial tests are Day 2 work.
