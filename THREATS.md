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
| 7 | Cross-origin calls from untrusted websites | CORS: exact origins only ("*" rejected at startup), explicit methods + headers, `Vary: Origin` | Done (Day 2 Task 5) |
| 8 | Password theft from database | bcrypt (cost 12); hash never returned by API; max 72 bytes enforced | Done (Task 3) |
| 9 | Users accessing other users' accounts | `canAccessAccount` ownership check on the backend, refusals audited; unit tested | Done – account endpoints (Task 5), transactions (Task 6) |
| 10 | Negative balances / partial transfers | Single DB transaction per movement, `FOR UPDATE` row locks, balance check on locked row, DB CHECK `balance >= 0`; rollback tested | Done (Task 6) |
| 11 | Duplicate payments from retried requests | Required `Idempotency-Key`; key row inserted in the same DB transaction as the movement; `UNIQUE(userId, key)` | Done (Day 2 Task 6) |
| 12 | Race conditions / deadlocks on concurrent transfers | Sorted lock order; retry with jitter on 40P01/40001/P2034 (tested with a real deadlock); 30 Jest concurrency tests | Done (Day 2 Task 7) |
| 13 | Ledger history tampered with (edit/delete/truncate) | Triggers block UPDATE/DELETE/TRUNCATE on `ledger_entries`, `audit_logs` and `transactions` | Done (Day 2 Task 7) |
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
| 29 | Account spam / limit bypass by simultaneous requests | Max 5 per user, counted inside a transaction that locks the user row (tested: 10 at once → 5) | Done (Day 2 Task 8) |
| 30 | Status change racing with a money movement | Status update locks the row (`FOR UPDATE`) in a transaction | Done (Task 5) |
| 31 | Moving money from someone else's account | Ownership checked on the **locked** row inside the transaction (ACCOUNT_HOLDER + owner only) | Done (Task 6) |
| 32 | Malformed amounts (0, negative, decimals, `1e5`, huge) | Zod: integer or digit string → BigInt, > 0; policy limits per operation | Done (Task 6) |
| 33 | Refused attempts leave no trace (rolled back with the transaction) | Refusals audited outside the transaction; validation failures on money routes audited too | Done (Task 6) |
| 34 | Recipient balance leaked to sender | Transfer response only includes the caller's account balance | Done (Task 6) |
| 35 | Ledger silently drifts from balances | Prevented by the DB: running-balance chain trigger + commit-time checks (balance = ledger, every transaction balanced); `/api/ledger/verify` as an independent audit | Done (Day 2 Task 7) |
| 36 | Debug info (paths, code) leaked in errors | `NODE_ENV` now defaults to `production`; debug only when explicitly `development` | Done (Task 6) |
| 37 | Duplicate money movement on client retry | Idempotency (see #11); tested: 10 simultaneous identical requests → 1 transaction | Done (Day 2 Task 6) |
| 38 | SYSTEM account row is a lock hotspot (all deposits/withdrawals serialize on it) | Accepted for now; could shard SYSTEM accounts later | Known limitation |

| 39 | JWT stolen by XSS from browser storage | Token stored only in an `HttpOnly` cookie; never returned to the browser app's JavaScript | Done (Day 2 Task 2) |
| 40 | CSRF using the session cookie | `SameSite=Strict`; CORS credentials only for the exact frontend origin; cookie-authenticated writes require `X-Requested-With` (403 + audit otherwise) | Done (Day 2 Task 2) |
| 41 | Open redirect after login (`?from=//evil.com`) | Redirect target taken from router state and only accepted if it is an internal path (`/…`, not `//…`) | Done (Day 2 Task 2) |
| 42 | UI shows pages a role shouldn't see | `ProtectedRoute roles={…}` hides them – **UI only**; the backend still enforces every permission | Done (Day 2 Task 2) |
| 43 | Session can't be revoked server-side before expiry | Logout clears the cookie; deactivated users are rejected on the next request; no token denylist | Partial |

| 44 | Account search used to discover other users' accounts | `?q=` is applied inside the holder's own-accounts filter (tested: holder searching another user's name → 0 results) | Done (Day 2 Task 3) |
| 45 | Money summed in the browser (rounding, tampering) | Totals computed by PostgreSQL (`SUM`) and sent as formatted strings | Done (Day 2 Task 3) |
| 46 | Dashboard calling APIs the role can't use | Each dashboard only calls its role's APIs; backend still returns 403 for anything else | Done (Day 2 Task 3) |

| 47 | Recipient's balance / identity leaked through transaction details | Holders only receive ledger entries on their own accounts; `initiatedBy` hidden from receivers; uninvolved users get 403 (audited) | Done (Day 2 Task 4) |
| 48 | Floating-point errors from typed amounts | Amount parsed as text (decimal point moved as a string) and sent as paise; backend re-validates | Done (Day 2 Task 4) |
| 49 | Accidental double submission (double-click) | Button disabled while sending + same Idempotency-Key for the operation (server-enforced) | Done (Day 2 Task 6) |
| 50 | User retries after a timeout and pays twice | "Retry safely" re-sends the same body + key → original result (tested with a dropped response) | Done (Day 2 Task 6) |

| 51 | Misconfigured `CORS_ORIGIN="*"` with cookies exposes sessions to any site | Env validation refuses to start with `*`, paths or trailing slashes | Done (Day 2 Task 5) |
| 52 | A rendering bug blanks the whole app | `ErrorBoundary` per page; nothing sensitive is sent anywhere | Done (Day 2 Task 5) |
| 53 | Deactivated user keeps using an open browser session | Backend rejects on the next request (401); UI signs them out – tested | Done (Day 2 Task 5) |

| 54 | Idempotency key reused with different data (e.g. bigger amount) | SHA-256 fingerprint of endpoint + validated body; mismatch → 422 + audit | Done (Day 2 Task 6) |
| 55 | Another user's key interferes | Keys are scoped per user (`UNIQUE(userId, key)`) | Done (Day 2 Task 6) |
| 56 | Tests accidentally run against real data | `.env.test` + setup refuses any database not named `ledgerline_test` | Done (Day 2 Task 6) |
| 57 | Idempotency table grows forever | Keys expire after 24 h and are reused; no scheduled cleanup job yet | Known limitation |

| 58 | Lost update (two requests read the same balance) if the app lock were ever missing | Chain trigger rejects it – proven by removing `FOR UPDATE` in a mutation test | Done (Day 2 Task 7) |
| 59 | Money created by SQL (`UPDATE accounts SET balance = …`) | Commit-time trigger: balance must equal the latest ledger balance | Done (Day 2 Task 7) |
| 60 | Database superuser bypass (can disable triggers) | Out of scope: the app uses a non-superuser role; protect superuser credentials operationally | Accepted risk |

| 61 | Automated tests writing to real data | Test tools load `.env.test` explicitly and refuse any database not named `ledgerline_test` (a silent fallback to `.env` was found and fixed) | Done (Day 2 Task 8) |
| 62 | Payments break when served over plain http (no `crypto.randomUUID`) | UUID v4 fallback via `crypto.getRandomValues` | Done (Day 2 Task 8) |
| 63 | Rate limits per process (in-memory) / wrong client IP behind a proxy | Fine for one server; production needs a shared store (e.g. Redis) and `trust proxy` configured | Known limitation |
| 64 | No HTTPS in local development | `Secure` cookie flag switches on with `NODE_ENV=production`; deploy behind HTTPS | Deployment requirement |

## Summary

All money paths are protected in two layers – application checks inside one PostgreSQL transaction, and database
constraints/triggers that refuse an unbalanced or rewritten ledger. Idempotency, concurrency and adversarial behaviour
are covered by automated tests (161 backend, 23 browser, 12 frontend unit). Remaining items are the known limitations
above (#21, #43, #57, #60, #63, #64).

> **This is a learning project with simulated money.** It has been tested carefully, but it has not had an independent
> security audit and is not claimed to be production-ready. Idempotency, formal concurrency tests and automated adversarial tests are Day 2 work.
