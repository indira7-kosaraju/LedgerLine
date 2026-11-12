# LedgerLine – Financial Security Threat Model

**Last updated:** 2026-11-07 (Day 3)
**System:** React frontend → Express API (JWT in an HttpOnly cookie) → PostgreSQL via Prisma. Simulated money only (INR, stored as integer paise).

## How to read this document

Each threat lists its description, an attack scenario, the impact, how it is prevented, **where the protection is in the code**,
**which automated test proves it**, and the risks that remain. A protection is only marked as working when code **and** a passing
test show it. Where it says *mutation-tested*, the protection was temporarily removed and the named tests had to fail; they did.

- Test files are in `backend/tests/integration/` (Jest + Supertest, run against the separate `ledgerline_test` database) and
  `frontend/e2e/` (Playwright in Chrome). Test names are quoted exactly as Jest/Playwright print them.
- Run everything: `cd backend && npm test` (344 tests) · `cd frontend && npm run test:e2e` (24 tests).
- Related: [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md) – the Day 3 audit with the actual result of each attack.

## Summary

| # | Threat | Status | Main protection | Proven by |
|---|---|---|---|---|
| 1 | Duplicate transactions | ✅ Mitigated | Required `Idempotency-Key`, unique per user, stored in the same DB transaction as the money | `idempotency.test.js` (mutation-tested) |
| 2 | Concurrent withdrawals | ✅ Mitigated | `SELECT … FOR UPDATE` row lock; balance checked on the locked row | `concurrency.test.js` (mutation-tested) |
| 3 | Race conditions (lost updates) | ✅ Mitigated | Row locks + database chain trigger | `concurrency.test.js`, `accounts.test.js` |
| 4 | Unauthorized account access | ✅ Mitigated | Ownership check on the server for every account action | `authorization.test.js`, `security.test.js` |
| 5 | Privilege escalation | ✅ Mitigated | Role read from the DB on every request; strict input schemas | `auth.test.js`, `authorization.test.js`, `security.test.js` |
| 6 | Negative balances | ✅ Mitigated | Check on the locked row + `CHECK (balance >= 0)` | `concurrency.test.js`, `ledgerSecurity.test.js` |
| 7 | SQL injection | ✅ Mitigated | Prisma parameterised queries; no unsafe raw SQL in app code | `security.test.js` |
| 8 | Ledger tampering | ✅ Mitigated (⚠️ see risks) | Append-only + balancing triggers in PostgreSQL | `ledgerSecurity.test.js` |
| 9 | Partial transaction failures | ✅ Mitigated | One PostgreSQL transaction per movement; commit-time checks | `concurrency.test.js`, `financialIntegrity.test.js` |
| 10 | Idempotency key reuse | ✅ Mitigated | SHA-256 fingerprint of endpoint + body | `idempotency.test.js` (mutation-tested) |
| 11 | Deadlocks | ✅ Mitigated | Locks always taken in sorted order; retry on deadlock | `concurrency.test.js` |
| 12 | Replay attacks | ✅ Mitigated (fixed Day 3) | Idempotent replays; session version revokes tokens on logout | `security.test.js` (mutation-tested) |
| 13 | Brute-force login attempts | ⚠️ Partially (improved in step 3) | Redis-backed limits per IP **and per account**, fail closed; bcrypt; generic errors | `redisRateLimit.test.js`, `redisDown.test.js`, `rateLimit.test.js`, `auth.test.js` |

---

## 1. Duplicate transactions

**Description.** The same money movement is executed more than once.

**Attack scenario.** A user clicks *Transfer ₹500*. The server completes it, but the Wi-Fi drops before the answer arrives, so the
browser (or the user) sends the request again. Or a script deliberately fires the same request many times.

**Possible impact.** Money leaves the account twice; customer funds are lost and the books no longer match what the user intended.

**Prevention mechanism.** Every deposit, withdrawal and transfer must carry an `Idempotency-Key`. The key row is inserted **inside the
same PostgreSQL transaction** as the money movement, under `UNIQUE("userId", key)`. A committed movement therefore always has a
committed key row, and only one such row can exist – a second movement with the same key is impossible. A retry gets the stored
original response with `Idempotent-Replayed: true`.

**Implemented protection.**
- `backend/src/middleware/idempotency.js` – key required (400 if missing/invalid), request fingerprint.
- `backend/src/services/idempotency.service.js` – `claimKey` (first step in the transaction), `completeKey` (stores the response before commit), `runIdempotent` (replays).
- `backend/src/services/transaction.service.js` – `moveMoney` claims the key before locking any account.
- `frontend/src/pages/MoneyMovementPage.jsx` – one key per reviewed operation; **Retry safely** re-sends the same body and key.

**Corresponding tests.**
- `idempotency.test.js` › "1. the same transfer request sent twice → one transaction; the second answer is a replay"
- `idempotency.test.js` › "2. the same key used again and again → exactly one key row, one transaction, two ledger entries, all linked"
- `idempotency.test.js` › "4. 25 identical transfers sent at the same moment → one transaction, 24 replays, books consistent"
- `idempotency.test.js` › "10 identical deposits at once → exactly one transaction, all get the same result"
- `idempotency.test.js` › "without a key a transfer cannot be sent at all (400) – so a client cannot "forget" protection"
- `frontend/e2e/money.spec.js` › "lost response: the server processed it, "Retry safely" returns the original – money moves once"
- *Mutation-tested:* removing the key claim made 10 identical deposits create 10 transactions (Day 2) and failed 10 of 11 Day 3 transfer tests.

**Remaining accepted risks.**
- Keys are remembered for 24 hours (`IDEMPOTENCY_TTL_HOURS`); a retry after that is treated as a new operation.
- A client that creates a **new** key for every retry defeats the protection (our frontend does not).
- Expired keys are reused on demand but never deleted by a scheduled job, so the table grows.

## 2. Concurrent withdrawals

**Description.** Two withdrawals (or transfers) from the same account run at the same moment and both pass the balance check.

**Attack scenario.** Balance ₹1,000. The attacker sends "withdraw ₹800" and "withdraw ₹700" simultaneously, hoping both read ₹1,000.

**Possible impact.** ₹1,500 leaves a ₹1,000 account – an overdraft, or money created out of nothing.

**Prevention mechanism.** Inside the money transaction the account row is locked with `SELECT … FOR UPDATE`, and the balance is checked
**on the locked row**. The second request waits for the first to commit and then sees the real, reduced balance.

**Implemented protection.** `backend/src/services/transaction.service.js` – `lockAccounts()` and `checkRules()`.

**Corresponding tests.**
- `concurrency.test.js` › "Two simultaneous withdrawals: ₹1,000 balance, ₹800 and ₹700" (20 runs: exactly one succeeds, balance never negative)
- `concurrency.test.js` › "50 simultaneous ₹100 withdrawals from ₹1,000 → exactly 10 succeed, balance ends at ₹0"
- `concurrency.test.js` › "20 transfers of ₹100 from a ₹1,000 account to 4 receivers at once → exactly 10 succeed"
- `concurrency.test.js` › "proof the requests REALLY overlap: PostgreSQL sees all 12 waiting for the same lock at once" (proves the tests are genuinely concurrent; it fails with "Expected: 12, Received: 1" if the requests are sent one after another)
- *Mutation-tested:* removing `FOR UPDATE` failed 21 of 22 race tests (Day 2) and all 6 Day 3 concurrency tests.

**Remaining accepted risks.** All deposits and withdrawals also lock the single SYSTEM account row, so they are processed one at a time
(a throughput limit, not a safety issue).

## 3. Race conditions (lost updates)

**Description.** Two transactions read the same value and both write a result based on it; one update is lost.

**Attack scenario.** Without locking, two requests both read ₹1,000 and write ₹200 and ₹300 – the last write wins and ₹1,500 has left
while the balance shows ₹300. A similar race let 10 simultaneous "open account" requests create 7 accounts despite the limit of 5.

**Possible impact.** Money created or destroyed silently; business limits bypassed.

**Prevention mechanism.** Row locks in the application **and**, independently, the database trigger `ledger_entries_check_chain`, which
rejects any ledger entry whose `balanceAfter` does not continue the account's running total. Account creation counts the user's
accounts inside a transaction that locks the user row.

**Implemented protection.**
- `backend/src/services/transaction.service.js` – `lockAccounts()`.
- `backend/prisma/migrations/20261107140000_ledger_integrity_triggers/migration.sql` – chain trigger and commit-time balance check.
- `backend/src/services/account.service.js` – `createAccount()` locks the user row (fixed Day 2, found by a test).

**Corresponding tests.**
- `concurrency.test.js` › "40 deposits into ONE account at the same moment → every rupee arrives, nothing is lost"
- `concurrency.test.js` › "30 deposits and 30 withdrawals on one account at the same moment → no lost updates"
- `concurrency.test.js` › "mixed storm: 150 random deposits/withdrawals/transfers at once → books stay exact"
- `accounts.test.js` › "10 simultaneous "open account" requests never create more than 5 accounts"
- *Defence in depth shown:* with `FOR UPDATE` removed, the chain trigger rejected all 9 lost updates that a probe produced ("Ledger chain broken"); the old `CHECK` constraint alone would not have caught them.

**Remaining accepted risks.** Concurrency is tested for the scenarios above; an admin status change racing a transfer is protected by
the same row lock but has no dedicated concurrent test.

## 4. Unauthorized account access

**Description.** A user reads or moves money in an account that is not theirs.

**Attack scenario.** Asha copies Ravi's account id from a shared screenshot and calls `GET /api/accounts/<id>` or
`POST /api/transactions/transfer` with `fromAccountId` = Ravi's account.

**Possible impact.** Privacy breach (balances, statements) or theft.

**Prevention mechanism.** Every account action is checked on the server: holders may only view or move money from accounts they own;
admins and auditors may view, never move money. Money rules are checked on the **locked** row inside the transaction. Transaction
details show a holder only the ledger entries on their own accounts. Refusals are audited.

**Implemented protection.**
- `backend/src/services/accessControl.service.js` – `canAccessAccount`, `assertAccountAccess`.
- `backend/src/services/transaction.service.js` – `checkRules()` (ownership on the locked row), `getTransaction()` (privacy filter).
- `backend/src/config/permissions.js` – role permissions.

**Corresponding tests.**
- `authorization.test.js` › "view account → 403", "view balance → 403", "view statement → 403", "view transaction → 403"
- `authorization.test.js` › "deposit into it → 403 NOT_OWNER, balances unchanged, refusal audited" (also "withdraw from it", "transfer out of it")
- `security.test.js` › "another user's account: view, statement and money movement are all refused"
- `transactions.test.js` › "the sender sees only their own entry, not the receiver's balance"
- `unit/accessControl.test.js` › "missing ids never count as ownership" (this test found a real bug on Day 1)

**Remaining accepted risks.** A holder gets 403 for someone else's account and 404 for a non-existent one, which reveals that an id
exists; ids are random UUIDs, so this has no practical value to an attacker. The frontend's role checks only hide UI – the backend enforces everything.

## 5. Privilege escalation

**Description.** A user gains a role or permission they were not given.

**Attack scenario.** Registering with `"role": "ADMIN"`; editing the role inside a JWT; sending `"role"` along with an admin request;
an auditor calling admin endpoints.

**Possible impact.** Full control: freezing accounts, deactivating users, reading every customer's data.

**Prevention mechanism.** Public registration always creates `ACCOUNT_HOLDER`. Request bodies use strict schemas (unknown fields → 400).
The user's role is **loaded from the database on every request**; the role inside the token is ignored. Admins and auditors can never
move money (separation of duties); auditors are read-only.

**Implemented protection.** `backend/src/services/auth.service.js` (role hard-coded), `backend/src/middleware/authenticate.js`
(DB lookup), `backend/src/middleware/authorize.js` + `backend/src/config/permissions.js`, Zod `strictObject` schemas in
`backend/src/utils/schemas/`.

**Corresponding tests.**
- `auth.test.js` › "mass assignment (choosing a role) → 400"
- `auth.test.js` › "the role inside a token is ignored – the role in the database counts"
- `security.test.js` › "mass assignment on the admin status endpoint (sneaking in "role") → 400"
- `security.test.js` › "an auditor cannot perform admin operations or move money"
- `authorization.test.js` › "ADMIN and AUDITOR cannot deposit (separation of duties)" (also withdraw, transfer, open account)
- `authorization.test.js` › "AUDITOR is read-only: can read everything, change nothing"

**Remaining accepted risks.** Admins are powerful by design (no two-person approval, no MFA). Admin and auditor accounts are created
only by the seed script from `.env`; their passwords must be strong and kept secret.

## 6. Negative balances

**Description.** A customer account ends up below ₹0.

**Attack scenario.** Withdrawing more than the balance, racing withdrawals (threat 2), or writing a negative balance directly in SQL.

**Possible impact.** The bank effectively lends money it never agreed to lend; money is created.

**Prevention mechanism.** Two independent layers: the application refuses with `422 INSUFFICIENT_FUNDS` after checking the locked
row, and PostgreSQL refuses any customer balance below 0 (`CHECK` constraint).

**Implemented protection.** `checkRules()` in `backend/src/services/transaction.service.js`; constraint
`accounts_customer_balance_non_negative` in `backend/prisma/migrations/20261106163849_init/migration.sql`.

**Corresponding tests.**
- `transactions.test.js` › "withdrawing the exact balance is allowed (down to ₹0, never below)"
- `financialIntegrity.test.js` › "insufficient balance → refused, balances and ledger unchanged, refusal audited"
- `ledgerSecurity.test.js` › "negative customer balance → refused"
- `tests/invariants.js` – the independent SQL oracle checks `negativeCustomerBalances = 0` after the concurrency, idempotency and integrity suites.

**Remaining accepted risks.** The SYSTEM account is negative by design (it mirrors money that came in from outside). There are
per-transaction limits but no daily limits.

## 7. SQL injection

**Description.** User input is executed as SQL.

**Attack scenario.** Searching for `' OR '1'='1`, registering the name `Robert'); DROP TABLE users;--`, or putting SQL into an
account number or id.

**Possible impact.** Reading or destroying all data, including the ledger.

**Prevention mechanism.** All queries go through Prisma, which sends values separately from the SQL text. The few raw queries use
tagged templates (`` $queryRaw`…${value}` ``), which are parameterised too. The application code contains **no**
`$queryRawUnsafe` / `$executeRawUnsafe`. Inputs are validated (UUIDs, `LL` + 10 digits, email format) before reaching the database.
LIKE wildcards (`% _ \`) are escaped in searches.

**Implemented protection.** Prisma throughout `backend/src/services/`; `backend/src/utils/escapeLike.js` (fixed Day 3); Zod schemas.

**Corresponding tests.**
- `security.test.js` › "account search q="' OR '1'='1" returns no extra rows and no error" (and three more payloads)
- `security.test.js` › "a name containing SQL is stored as plain text and the tables still exist"
- `security.test.js` › "injection in a transfer account number → rejected as invalid input, nothing moves"
- `security.test.js` › "LIKE wildcards are literal: "%" and "_" no longer match everything (FIXED in Day 3)" *(mutation-tested: 2 tests fail without escaping)*

**Remaining accepted risks.** Test code uses `$executeRawUnsafe` to create temporary failure triggers – only against `ledgerline_test`.

## 8. Ledger tampering

**Description.** Someone changes or deletes history, or makes the books not balance.

**Attack scenario.** With database access: `UPDATE ledger_entries SET amount = 1`, `TRUNCATE ledger_entries`, editing a
transaction's amount, or `UPDATE accounts SET balance = balance + 100000` (money from nowhere).

**Possible impact.** Loss of the proof that every balance is correct; hidden theft.

**Prevention mechanism.** PostgreSQL itself refuses it:
- triggers block UPDATE, DELETE and TRUNCATE on `ledger_entries`, `transactions` and `audit_logs`;
- every new entry must continue the account's running balance (chain trigger);
- at commit, every new transaction must have exactly one matching DEBIT and CREDIT, and every changed balance must equal its latest ledger balance.

The API has no routes that edit history. `GET /api/ledger/verify` and `npm run verify:db` recompute everything as an independent audit.

**Layer 1 – the API's database role cannot even try.** The API connects as `ledgerline_api`, a separate role with only row
privileges (`backend/scripts/setup-db-roles.js`): `SELECT/INSERT` on `transactions`, `ledger_entries` and `audit_logs` (no UPDATE,
DELETE or TRUNCATE), `SELECT/INSERT/UPDATE` on `users` and `accounts`, `DELETE` only on `idempotency_keys`, no access to
`_prisma_migrations`, no CREATE in the schema, no special attributes. It does not own the tables, so it cannot disable or drop a
trigger. Migrations and role setup use the table **owner** through a separate `DIRECT_DATABASE_URL` that the server never has.

**Implemented protection.** `backend/prisma/migrations/20261106163849_init/migration.sql` (append-only triggers, CHECKs) and
`backend/prisma/migrations/20261107140000_ledger_integrity_triggers/migration.sql`; `backend/scripts/setup-db-roles.js` (roles);
`backend/scripts/verify-db.js` (also checks that the connected role owns no tables).

**Corresponding tests.**
- `ledgerSecurity.test.js` › "UPDATE a ledger entry → refused", "DELETE a ledger entry → refused", "TRUNCATE the ledger → refused", "UPDATE a transaction amount → refused", "UPDATE an audit record → refused", "TRUNCATE the audit log → refused"
- `ledgerSecurity.test.js` › "money from nowhere: raising a balance without a ledger entry → refused at commit"
- `ledgerSecurity.test.js` › "unbalanced entries (debit ₹1.00, credit ₹0.90) → refused at commit"
- `security.test.js` › "ledger records cannot be changed through the API (no such routes exist)"
- The independent SQL oracle (`tests/invariants.js`) was itself proven: with one trigger disabled on the test DB, adding ₹0.01 was reported immediately.
- `dbRoles.test.js` › as the API role, 21 statements are refused by PostgreSQL ("disable the append-only trigger", "drop a trigger",
  "skip triggers with session_replication_role", "DELETE ledger entries", "UPDATE a transaction", "TRUNCATE the ledger", "create a
  role", …); "its privileges are EXACTLY the planned list"; "re-running takes away a privilege that was granted by hand"; "a table that
  is not in the privilege list → the script refuses"; "password form: SCRAM hash locally, plain text (over TLS) only for Neon"
  (Neon refuses pre-hashed passwords; a Neon owner URL without `sslmode=require` is refused, and passwords never appear in error
  messages). The tamper tests in `ledgerSecurity.test.js` run as the **owner** (layer 2).

**Remaining accepted risks.**
- **Production is switched over (verified 2026-11-12):** Render's `DATABASE_URL` uses `ledgerline_api` through Neon's pooler. Read-only
  checks on Neon: the only app connection is `ledgerline_api`, and as that role PostgreSQL refused disabling the append-only trigger,
  DELETE on ledger entries and audit logs, UPDATE on transactions, reading `_prisma_migrations` and CREATE TABLE. `verify-db` (14 checks,
  including "connected as a limited role") and the 25 live checks against https://ledger-line-umber.vercel.app all passed.
- Whoever has the **owner** password (`DIRECT_DATABASE_URL`, kept only on the operator's computer) can still disable the triggers.
- A database superuser or host compromise is out of scope.

## 9. Partial transaction failures

**Description.** A movement stops halfway – e.g. money debited but never credited.

**Attack scenario.** The server crashes, the database connection drops, or a write fails after the first balance update.

**Possible impact.** Money disappears or appears; balances stop matching the ledger.

**Prevention mechanism.** Each movement is **one PostgreSQL transaction**: key claim, row locks, both balance updates, the transaction
row, both ledger entries, the audit row and the stored response commit together or not at all. Deferred (commit-time) triggers reject
an incomplete transaction. If the response is lost after commit, the idempotency key lets the client retry safely (threat 1).

**Implemented protection.** `moveMoney()` in `backend/src/services/transaction.service.js` (`prisma.$transaction`); commit-time triggers in the `20261107140000_ledger_integrity_triggers` migration.

**Corresponding tests.**
- `concurrency.test.js` › "a failure in the middle of a transfer leaves NO trace: balances, transaction, ledger, idempotency key"
- `concurrency.test.js` › "rollback under load: 10 transfers crash mid-way while 10 others succeed → only the good ones remain"
- `financialIntegrity.test.js` › "failed withdrawal is rolled back completely (balance update + transaction row undone)"
- `ledgerSecurity.test.js` › "a transaction with no ledger entries → refused at commit"

**Remaining accepted risks.** None known for money movement. Audit rows for **refused** attempts are written outside the money
transaction (so they survive the rollback); if the audit insert itself fails it is logged to the console instead.

## 10. Idempotency key reuse

**Description.** An old key is sent again with **different** data, hoping the server confuses the two requests.

**Attack scenario.** A transfer of ₹100 succeeds with key K. The attacker (or a buggy client) sends key K again with ₹99,999 or
another destination, hoping to get it executed – or to receive the cached "success" for a different request.

**Possible impact.** Wrong amount moved, or a client believes an operation succeeded that never ran.

**Prevention mechanism.** The server stores a SHA-256 fingerprint of the endpoint and the validated request body with each key. A
different fingerprint → `422 IDEMPOTENCY_KEY_REUSED`, audited, nothing executed. Keys are scoped per user.

**Implemented protection.** `canonicalJson()` and the hash in `backend/src/middleware/idempotency.js`; comparison in `findReplay()` in
`backend/src/services/idempotency.service.js`.

**Corresponding tests.**
- `idempotency.test.js` › "3. reusing a key with a different payload is rejected (422) and moves nothing" – cases: "a different amount", "a different destination", "a different description", "the destination by number instead of id", "a different endpoint (withdraw)"
- `idempotency.test.js` › "same key, different bodies at once → one wins, the rest are rejected, nothing extra moves"
- `idempotency.test.js` › "two users can use the same key value independently"
- *Mutation-tested:* disabling the fingerprint comparison failed exactly the 5 different-payload tests.

**Remaining accepted risks.** Sending the same account as an id vs. as an account number counts as a different request (422) – by
design, documented. Different keys with identical bodies are two separate operations, also by design.

## 11. Deadlocks

**Description.** Two transactions each hold a lock the other needs and wait forever.

**Attack scenario.** Transfers A→B and B→A start at the same moment; each locks its source account first.

**Possible impact.** Requests hang or fail; with naive retries, possible duplicates.

**Prevention mechanism.** Accounts are always locked in **sorted id order**, so two transfers on the same pair queue instead of
deadlocking. If PostgreSQL still reports a deadlock (40P01) or serialization failure (40001 / P2034), the whole transaction – already
rolled back – is retried up to 3 times with a short random wait.

**Implemented protection.** `lockAccounts()`, `withRetry()` and `isRetryable()` in `backend/src/services/transaction.service.js`.

**Corresponding tests.**
- `concurrency.test.js` › "30 A→B and 30 B→A transfers at the same time → all succeed, no deadlock"
- `concurrency.test.js` › "circular transfers A→B, B→C, C→A at the same time → all succeed"
- `concurrency.test.js` › "a real PostgreSQL deadlock is recognised as retryable"
- `concurrency.test.js` › "a transfer caught in a deadlock is retried and completes exactly once"
- `concurrency.test.js` › "withRetry: retries deadlocks up to 3 attempts, never retries other errors"

**Remaining accepted risks.** After 3 failed attempts the request returns 500; nothing was written, and the client can retry safely with the same key.

## 12. Replay attacks

**Description.** A captured request or session token is sent again later.

**Attack scenario.** (a) An attacker captures a valid money request and replays it. (b) An attacker copies a session token (e.g. from a
shared computer) and keeps using it after the owner logs out – or after an admin deactivates and later reactivates the account.

**Possible impact.** (a) Repeated money movement. (b) Continued access to someone's account.

**Prevention mechanism.** (a) Money requests are idempotent – a replay returns the stored result and moves nothing. Cross-site
replays are blocked by `SameSite=Strict` cookies and the `X-Requested-With` CSRF check. (b) **Fixed in Day 3:** every token carries
the user's `sessionVersion`; logout and admin status changes raise it, so all older tokens are rejected (`401 SESSION_REVOKED`).
Tokens also expire after 1 hour.

**Implemented protection.** `backend/src/utils/jwt.js` (`sv` claim), `backend/src/middleware/authenticate.js` (version check),
`backend/src/controllers/auth.controller.js` (`logout` revokes), `backend/src/services/user.service.js` (status change revokes),
migration `20261107180000_user_session_version`; `backend/src/middleware/csrfProtection.js`.

**Corresponding tests.**
- `security.test.js` › "a copied token stops working after logout"
- `security.test.js` › "a token from before a deactivation does NOT come back to life after reactivation"
- `security.test.js` › "replaying a captured money request does not move money again (idempotency)"
- `auth.test.js` › "cookie + POST without X-Requested-With → 403 CSRF_REJECTED (audited)"
- `auth.test.js` › "tampered, foreign-secret, alg:none and expired tokens → 401"
- *Mutation-tested:* removing the session-version check failed 4 tests; removing the bump on status change failed 1.

**Remaining accepted risks.** A stolen token works until it expires (≤ 1 hour) unless the owner logs out or an admin changes the
user's status. Logout ends the user's sessions on **all** devices (no per-device sessions). Tokens are not bound to a device or IP.

## 13. Brute-force login attempts

**Description.** Guessing passwords by trying many combinations.

**Attack scenario.** A script tries thousands of passwords for `asha@example.com`, or tries common passwords across many emails.

**Possible impact.** Account takeover.

**Prevention mechanism.** Failed logins are limited to 10 per 15 minutes per client IP **and** 10 per 15 minutes per account
(email, from any IP – wrong current passwords on change-password count too); while an account is locked even the correct password
gets `429`, and unknown emails are limited the same way, so the limit reveals nothing about which accounts exist. Registrations are
limited to 10 per hour per IP. Since step 3 the counters live in **Redis**: they survive restarts and deploys and are shared by all
server instances, keys are per environment (`ll:prod:` …) and accounts appear only as a SHA-256 hash, never as an email. If Redis is
unreachable, login, registration and change-password **fail closed** (`503 SERVICE_UNAVAILABLE`, no request is let through unlimited);
the rest of the API fails open, and `/api/health/ready` reports `redis: failed`. In production the server refuses to start without a
working Redis, so it can never silently fall back to per-process memory counters. Passwords need 8+ characters with upper case, lower case and a digit, and are stored with bcrypt (cost 12), which makes
each guess slow. Wrong password, unknown email and deactivated account all return the same message, and a dummy bcrypt comparison
makes their timing similar, so attackers can't learn which emails exist. Every failed login is audited with its real reason.
Behind a hosting proxy, `TRUST_PROXY` makes the limit apply to the real client IP (fixed Day 3).

**Implemented protection.** `backend/src/middleware/rateLimiters.js` (all limiters, fail-closed wrapper, account key),
`backend/src/config/redis.js` (connection, 1 s command timeout, fail fast after the first failed connection),
`backend/src/server.js` (Redis required in production), `backend/src/routes/auth.routes.js` (which limiter guards which route),
`backend/src/services/auth.service.js` (bcrypt, `DUMMY_HASH`, generic error), `backend/src/app.js` (`trust proxy`).

**Corresponding tests.**
- `rateLimit.test.js` › "after 3 failed logins the 4th attempt is blocked with 429 and Retry-After" (limit set to 3 for the test)
- `rateLimit.test.js` › "registration is limited per IP"
- `redisRateLimit.test.js` › "after 3 failures even the CORRECT password gets 429 – but other accounts are not affected" (limit 3),
  "the email is normalised", "an unknown email is limited the same way", "wrong current passwords on change-password count toward
  the same account limit", "shared by two server instances, and still there after a "restart"", "keys use the environment prefix,
  contain no email address, and expire"
- `redisDown.test.js` › "login, registration and change-password are refused with 503 – never let through unlimited", "the rest of
  the API keeps working (general limit fails open)", "readiness is 503 and only names the failed check"
- `serverStartup.test.js` › "production without REDIS_URL → refuses to start", "production with an unreachable Redis → refuses to start"
- Mutation-tested (step 3): limits failing open, the account limiter removed, counters in memory instead of Redis, emails not
  normalised, production starting without Redis – each made at least one of these tests fail.
- `auth.test.js` › "wrong password and unknown email give the SAME 401 message"
- `auth.test.js` › "weak password (too short) → 400" (also "no uppercase", "no digit", "over 72 bytes")
- `security.test.js` › "TRUST_PROXY=1: the address added by the proxy is used – a client cannot spoof it by prepending its own"

**Remaining accepted risks (why this is only "partially" mitigated).**
- **Lockout as denial of service:** anyone who knows an email address can lock that account for up to 15 minutes with 10 wrong
  passwords (the price of a per-account limit). No CAPTCHA, MFA or unlock-by-email.
- **Redis outage = nobody can sign in** until Redis is back (deliberate: fail closed). Sessions that already exist keep working.
- Render's free Key Value instance keeps data in memory only: if it restarts, all counters start from zero (a restart of the API
  alone no longer resets them).
- A botnet guessing *different* accounts from many IPs is slowed only by bcrypt and the per-account limit.
- Equal timing for wrong password vs. unknown email was measured manually on Day 1 (~0.2 s each); it is not an automated test.

---

## Other threats covered

| Threat | Protection | Test |
|---|---|---|
| Session token stolen by XSS | Token only in an `HttpOnly` cookie; never readable by JavaScript | `frontend/e2e/auth.spec.js` › "the session token is NOT readable by JavaScript (HttpOnly cookie)" |
| CSRF | `SameSite=Strict` + required `X-Requested-With` on cookie writes | `auth.test.js` › "cookie + POST without X-Requested-With → 403 CSRF_REJECTED (audited)" |
| CORS misconfiguration | Exact origins only; `CORS_ORIGIN=*` refused at startup | `security.test.js` › "CORS: the configured origin is allowed with credentials; other origins get nothing; never "*"" |
| Leaking internals in errors | Generic 500 body in production; no stack/SQL | `security.test.js` › "in production, a server error reveals no stack trace, SQL or debug text – and cookies are Secure" |
| Leaking hashes / internal fields | Explicit allow-list of public fields | `security.test.js` › "no response ever contains a password hash or session version" |
| Oversized / malformed requests | 10 KB body limit; JSON errors → 400; strict query schemas | `security.test.js` › "body larger than 10 KB → 413", "malformed JSON → 400 INVALID_JSON" |
| Secrets in the repository or bundle | `.env` files ignored; values scanned | Manual scan, Day 3 – see `docs/SECURITY_AUDIT.md` |
| Vulnerable dependencies | `npm audit`; `deepmerge-ts` override | `npm audit --omit=dev` → 0 (Day 3, manual) |
| Tests running against real data | Test tools refuse any database not named `ledgerline_test` | Found and fixed Day 2 Task 8 (`scripts/start-test-server.js`) |

## All remaining accepted risks

1. Whoever holds the database owner password (kept only on the operator's computer, never on Render) can still disable the triggers (threat 8).
2. Rate limits (Redis, per IP and per account): the account lockout can be triggered by others, a Redis outage blocks sign-in, no CAPTCHA or MFA (threat 13).
3. Stolen tokens stay valid for up to 1 hour unless the owner logs out (threat 12); logout signs out all devices.
4. Idempotency keys expire after 24 hours and are not cleaned up by a job (threat 1).
5. Deposits and withdrawals serialize on the SYSTEM account row (throughput, not safety) (threat 2).
6. 403 vs 404 reveals whether a (random UUID) account id exists (threat 4).
7. HTTPS is required in production; local development uses plain http.
8. No independent penetration test; LedgerLine uses simulated money only.
9. Deployed behind Vercel + Render with `TRUST_PROXY=2`: requests sent **directly** to the `onrender.com` URL (bypassing Vercel) can fake one
   `X-Forwarded-For` entry and so evade the per-IP rate limit. Traffic through the app's own URL is not affected.
