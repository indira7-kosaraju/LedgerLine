# PROMPTS.md – AI Usage Log

How AI (Claude Code, an AI coding assistant) was used to build LedgerLine over three days, what it produced, what was wrong
or incomplete, how that was found, and how it was fixed.

## How to read this log

- **Every entry follows the same structure:** date · prompt given to AI · what AI generated · what was incorrect or incomplete ·
  how the issue was identified · how it was corrected · related commit.
- **Attribution is honest.** "How the issue was identified" says *what* found it (a failing automated test, a mutation test, a
  manual probe, a code review, a screenshot) and *who* ran it. Most issues were found by tests and reviews the AI ran while I
  directed the work, reviewed the results and decided when a task was finished; I committed every change myself. My own
  observations go under **My review notes** in each entry.
- **Nothing is invented.** Only problems that actually happened are listed. Some entries also list mistakes in the AI's own test
  scripts – those were real too.
- **Commit references** use the exact commit messages. Commit hashes are added by me from `git log --oneline` (see the table at
  the end); the AI did not run Git commands.

## Index

| # | Date | Task | Topics | Commit message |
|---|---|---|---|---|
| 1 | 2026-11-06 | Day 1 · Project setup | setup | `chore: initialize LedgerLine project and backend` |
| 2 | 2026-11-06 | Day 1 · PostgreSQL + Prisma schema | **financial integrity** | `feat: configure PostgreSQL database and Prisma schema` |
| 3 | 2026-11-06 | Day 1 · JWT authentication | security | `feat: implement JWT authentication and user registration` |
| 4 | 2026-11-06 | Day 1 · Role-based authorization | security | `feat: implement role-based authorization and account permissions` |
| 5 | 2026-11-06 | Day 1 · Account APIs | **concurrency** (limit noted) | `feat: implement secure account management APIs` |
| 6 | 2026-11-06 | Day 1 · Deposit / withdraw / transfer | **financial integrity, concurrency** | `feat: implement deposit withdrawal and transfer APIs` |
| 7 | 2026-11-07 | Day 2 · Review + frontend setup | review | `feat: initialize React frontend with Tailwind CSS` |
| 8 | 2026-11-07 | Day 2 · Login and registration | security | `feat: implement login and registration pages` |
| 9 | 2026-11-07 | Day 2 · Role-based dashboards | **financial integrity** (no money math in UI) | `feat: implement role-based dashboards` |
| 10 | 2026-11-07 | Day 2 · Money movement pages | **financial integrity, idempotency** (UI) | `feat: implement deposit withdrawal and transfer interfaces` |
| 11 | 2026-11-07 | Day 2 · Backend integration | errors, CORS | `feat: integrate React frontend with backend APIs` |
| 12 | 2026-11-07 | Day 2 · Idempotency | **idempotency** | `feat: implement idempotent financial transactions` |
| 13 | 2026-11-07 | Day 2 · Concurrency and ledger integrity | **concurrency, financial integrity** | `feat: strengthen concurrency control and ledger integrity` |
| 14 | 2026-11-07 | Day 2 · Testing and final review | **concurrency**, testing | `test: verify financial transactions and application integration` |
| 15 | 2026-11-07 | Day 3 · Review + automated tests | **financial integrity** | `test: add authentication and account management tests` · `test: add financial transaction integrity tests` |
| 16 | 2026-11-07 | Day 3 · Idempotency testing | **idempotency** | `test: verify idempotency and duplicate transaction prevention` |
| 17 | 2026-11-07 | Day 3 · Concurrency testing | **concurrency** | `test: verify concurrent transaction safety` |
| 18 | 2026-11-07 | Day 3 · Security review | security, replay | `security: strengthen authentication and financial access controls` |
| 19 | 2026-11-07 | Day 3 · THREATS.md | threat model | `docs: add financial security threat model` |
| 20 | 2026-11-07 | Day 3 · This log | documentation | `docs: complete README and API documentation` (committed together with Task 7) |
| 21 | 2026-11-07 | Day 3 · README and API docs | documentation, **idempotency** (demo seed) | `docs: complete README and API documentation` |
| 22 | 2026-11-08 | Day 3 · Deployment | deployment, **security** (cookies, proxies, secrets) | `chore: finalize deployment configuration` |
| 23 | 2026-11-11 | Update · Step 1 | **security**, authentication, admin bootstrap | `feat: add secure first-admin bootstrap and password change` |
| 24 | 2026-11-11 | Update · Step 2 | **security**, database roles, ledger integrity | `security: run the API as a limited database role` |
| 25 | 2026-11-12 | Update · Step 3 | **security**, rate limiting, readiness | `feat: add Redis rate limiting, account lockout and readiness checks` |
| 26 | 2026-11-12 | Update · Step 4 | onboarding, **security**, database integrity | `feat: add customer onboarding with automatic approval` |
| 27 | 2026-11-12 | Fix · Step 4 | demo seed, idempotency, production safety | `fix: create demo transactions only once and make production demo seeding opt-in` |
| 28 | 2026-11-12 | Update · Step 5 | admin, user and staff management, **security**, audit | `feat: add admin dashboard, user management and staff management` |
| 29 | 2026-11-12 | Update · Step 6 | **audit integrity**, security events, passwords | `feat: add tamper-evident audit trail and security event logging` |

---

# DAY 1 – Backend foundation

## Entry 1 – Project setup

**Date:** 2026-11-06

**Prompt given to AI:** "LedgerLine – Day 1 Development Master Prompt" (the full Day 1 plan), starting with Task 1: create the
project, folder structure, npm packages, Express server, health check, environment variables and `.gitignore`. Plus my rule:
the AI must not run Git commands; I commit and push myself.

**What AI generated:** the `backend/` and `frontend/` folder structure; Express 5 with Helmet, CORS, a 10 KB JSON limit, a global
rate limit, 404 and error handlers (`src/app.js`, `src/server.js`); `GET /api/health`; Zod validation of environment variables at
startup (`src/config/env.js`); `.gitignore`, `.env`, `.env.example`, README.md, THREATS.md and this file.

**What was incorrect or incomplete:**
- npm 11 skipped bcrypt's install script (warning).
- PostgreSQL was not installed on the Mac yet.

**How the issue was identified:** the npm warning appeared during installation; the AI then ran `bcrypt.hash` to check whether
bcrypt still worked. `psql --version` showed PostgreSQL was missing.

**How it was corrected:** bcrypt 6 ships prebuilt binaries, so it worked without the script – no change needed (verified). PostgreSQL
installation was planned for Task 2. Prisma was intentionally left for Task 2 so that commit contains the whole database setup.

**Related commit:** `chore: initialize LedgerLine project and backend`

**My review notes:** _(to be completed by me)_

---

## Entry 2 – PostgreSQL and Prisma schema

**Date:** 2026-11-06

**Prompt given to AI:** "yes start task2" – configure PostgreSQL, connect Prisma, create the User, Account, Transaction,
LedgerEntry, IdempotencyKey and AuditLog models with keys, constraints, indexes and timestamps; store money as integer paise.

**What AI generated:** PostgreSQL 17 (Homebrew) with a dedicated non-superuser role `ledgerline_app`; Prisma 6.19.3; the schema
with money as `BigInt` paise; a **double-entry design** (every transaction has one DEBIT and one CREDIT; deposits and withdrawals use
a SYSTEM account so all balances always sum to zero); hand-written SQL: `CHECK` constraints (no negative customer balance, positive
amounts, from ≠ to) and append-only triggers on `ledger_entries` and `audit_logs`; a seed script for the SYSTEM account.

**What was incorrect or incomplete:**
1. Prisma's `latest` tag pointed to a release candidate (8.0.0-rc); Prisma 7 changes client generation for plain-JS projects.
2. npm 11 skipped Prisma's install scripts, so the Prisma Client was not generated.
3. **The AI's first constraint test was flawed:** psql ran two statements in one transaction, so a failed `CHECK` rolled back the
   test user too, and the next test silently inserted nothing.
4. An AI test command failed because zsh does not split a command stored in a variable.

**How the issue was identified:** (1) `npm view prisma dist-tags`; (2) `prisma generate` had to be run manually; (3) a test printed
no output where an error was expected, and the AI traced it to the rolled-back transaction; (4) a "no such file or directory" error.

**How it was corrected:** pinned Prisma 6.19.3; added `"postinstall": "prisma generate"`; re-ran each constraint test separately
(all fired); used a shell function instead of a variable.

**Related commit:** `feat: configure PostgreSQL database and Prisma schema`

**My review notes:** _(to be completed by me)_

---

## Entry 3 – JWT authentication

**Date:** 2026-11-06

**Prompt given to AI:** "task 3" – registration, login, bcrypt hashing, JWT generation, JWT middleware, current-user endpoint,
input validation and error handling.

**What AI generated:** register / login / me endpoints; strict Zod schemas (unknown fields such as `role` rejected); password
rules including a 72-byte maximum (bcrypt ignores anything longer); bcrypt cost 12; JWT with a pinned algorithm, issuer, audience
and 1-hour expiry; middleware that re-loads the user from the database on every request; a dummy bcrypt comparison so unknown
emails take as long as wrong passwords; login and registration rate limits; audit rows for every success and refusal.

**What was incorrect or incomplete:** no blocking problems. Noted: rate-limit counters are in memory (reset on restart).

**How the issue was identified:** the AI ran 13 curl cases (duplicate email, `role: ADMIN` injection, weak password, wrong password,
unknown email, tampered / wrong-secret / `alg:none` tokens) and measured login timing (~0.2 s for both wrong password and unknown email).

**How it was corrected:** nothing to correct; the in-memory limitation was recorded in THREATS.md.

**Related commit:** `feat: implement JWT authentication and user registration`

**My review notes:** _(to be completed by me)_

---

## Entry 4 – Role-based authorization

**Date:** 2026-11-06

**Prompt given to AI:** "task 4" – ADMIN, ACCOUNT_HOLDER and AUDITOR roles; middleware for roles and account ownership; never trust
frontend authorization.

**What AI generated:** one permission matrix (`src/config/permissions.js`) – admins and auditors can never move money, auditors are
read-only; `requirePermission` middleware; `canAccessAccount` / `assertAccountAccess` for ownership; admin and auditor accounts
created only by the seed script from `.env`; audit-log and admin user endpoints; 16 unit tests.

**What was incorrect or incomplete:** **a real bug in the AI's first ownership check:** `account.ownerId === user.id`. When both
values are `undefined`, JavaScript evaluates `undefined === undefined` as `true`, so a malformed user object would "own" a malformed account.

**How the issue was identified:** a unit test the AI wrote for exactly this edge case ("missing ids never count as ownership") failed.

**How it was corrected:** ownership now requires `user.id` to be a non-empty string; the test passes.

**Related commit:** `feat: implement role-based authorization and account permissions`

**My review notes:** _(to be completed by me)_

---

## Entry 5 – Account management APIs

**Date:** 2026-11-06

**Prompt given to AI:** "task 5" – create accounts, list accounts, account details and balance; unique account numbers;
ownership checks; correct status codes.

**What AI generated:** account numbers `LL` + 10 random digits with a unique constraint; holders see only their own accounts
(the `ownerId` filter is ignored for them); new accounts always start at ₹0 and the client cannot set balance or owner; an admin
endpoint to freeze / unfreeze / close accounts with a row lock; money returned as `{ paise: "…", formatted: "₹…" }`.

**What was incorrect or incomplete:**
1. `JSON.stringify` throws on `BigInt` values.
2. **The AI's own unit test was wrong:** it expected `₹9,22,33,…775.07` for 2⁶³−1 paise.
3. **Concurrency gap noted:** the 5-account limit used "count, then insert", so simultaneous requests could exceed it.

**How the issue was identified:** (1) known JavaScript behaviour, handled while designing responses; (2) the test failed and the
AI cross-checked the code's output with `Intl.NumberFormat('en-IN')` – the code was right, the expected value wrong; (3) code review.

**How it was corrected:** (1) explicit money serialisation plus a global BigInt-safe JSON replacer; (2) fixed the expected value;
(3) recorded as a known limitation – it was later proven and fixed on Day 2 (Entry 14).

**Related commit:** `feat: implement secure account management APIs`

**My review notes:** _(to be completed by me)_

---

## Entry 6 – Deposit, withdrawal and transfer APIs

**Date:** 2026-11-06

**Prompt given to AI:** "task6" – deposit, withdraw, transfer, transaction list and statement; positive amounts only, no
floating-point money, PostgreSQL transactions, atomic transfers, no negative balances, ledger entries for every success, refused
attempts audited, full rollback on failure, money conservation, a consistent locking order.

**What AI generated:** one `moveMoney()` function used by all three operations, inside a single `prisma.$transaction`:
`SELECT … FOR UPDATE` on both accounts **in sorted id order** → rule checks on the locked rows → BigInt balance updates →
transaction row → DEBIT + CREDIT entries → audit row; retry on deadlocks; refusals audited outside the rolled-back transaction;
an `entryNumber` sequence for strict ordering; statements with a credits/debits proof; `GET /api/ledger/verify`.

**What was incorrect or incomplete:**
1. **Security issue:** a 500 response contained a `debug` field with internal file paths and code, because `NODE_ENV` defaulted to
   `development` when it was not set.
2. `prisma migrate dev` refused to run in the AI's non-interactive shell.
3. Idempotency was not implemented yet (planned for Day 2).

**How the issue was identified:** (1) the AI forced a failure in the middle of a transfer (temporary trigger) to test rollback and
read the error response; (2) the command's error message.

**How it was corrected:** (1) `NODE_ENV` now defaults to `production` (no debug details unless explicitly in development);
(2) the migration SQL was generated with `prisma migrate diff`, reviewed and applied with `prisma migrate deploy`.
Verified: the Day 1 scenario (₹5,000 + ₹2,000 − ₹1,000 − ₹500) gives ₹5,500; 20 parallel ₹1,000 withdrawals from ₹5,500 →
exactly 5 succeeded; the rollback left balances, transactions and ledger unchanged.

**Related commit:** `feat: implement deposit withdrawal and transfer APIs`

**My review notes:** _(to be completed by me)_

---

# DAY 2 – Frontend, idempotency, concurrency

## Entry 7 – Day 2 review and frontend setup

**Date:** 2026-11-07

**Prompt given to AI:** "LedgerLine – Day 2 Development Master Prompt" – review Day 1, then Task 1: React + Vite, React Router,
Tailwind CSS, Axios, folder structure, API configuration, environment variables.

**What AI generated:** a review (all Day 1 checks re-run) listing gaps for Day 2; the Vite + React 19 app with Tailwind 4, React
Router 8 and Axios; the backend URL read from `VITE_API_BASE_URL`; one Axios instance that turns every failure into a uniform error;
reusable UI components; a live system-status card.

**What was incorrect or incomplete:**
1. The linter warned twice about setting React state inside an effect (an unnecessary extra render).
2. Review gaps: no idempotency logic, no transaction-details endpoint, tokens returned in the JSON body, a global rate limit too low for dashboards.

**How the issue was identified:** (1) `npm run lint` (oxlint); (2) the AI's review of the code against the Day 2 requirements.

**How it was corrected:** (1) state is now set only inside promise callbacks, with a refresh counter; (2) each gap was scheduled into a Day 2 task.

**Related commit:** `feat: initialize React frontend with Tailwind CSS`

**My review notes:** _(to be completed by me)_

---

## Entry 8 – Login and registration

**Date:** 2026-11-07

**Prompt given to AI:** "task2" – login and registration pages with validation, password toggle, loading and error states, protected
routes; prefer HttpOnly cookies if supported, otherwise explain the trade-offs.

**What AI generated:** backend support for an HttpOnly, `SameSite=Strict` session cookie (Bearer still possible for API tools);
CSRF protection (cookie-based writes require `X-Requested-With`); a logout endpoint; React auth context, protected and guest routes,
login and registration forms with a live password checklist.

**What was incorrect or incomplete:**
1. **Bug in the AI's draft:** a toast was shown from inside a React state-updater function; in development React runs updaters twice,
   so the "session expired" message would have appeared twice.
2. Duplicate-email registrations printed a Prisma error stack in the server log although the error was handled correctly (409).

**How the issue was identified:** (1) the AI's own code review before testing; (2) reading the server log after the smoke test.

**How it was corrected:** (1) the session status is tracked in a ref instead; (2) Prisma logs warnings only – unexpected errors are
still logged by the error handler. Verified with a browser-style cookie test (register → refresh → forged request blocked → logout).

**Related commit:** `feat: implement login and registration pages`

**My review notes:** _(to be completed by me)_

---

## Entry 9 – Role-based dashboards

**Date:** 2026-11-07

**Prompt given to AI:** "task3" – separate dashboards for admin, account holder and auditor; never show data a user is not authorised to see.

**What AI generated:** a sidebar layout; one dashboard per role; searchable account list; account details with statement and ledger
proof; admin freeze/unfreeze; ledger and audit-log pages. Backend additions: the **total balance is summed by PostgreSQL** so React never
adds money up; account search; a filter for refused transaction attempts.

**What was incorrect or incomplete:**
1. Linter: a memoised value was recreated on every render; a hook dependency was missing.
2. From screenshots: a button wrapped onto two lines; the Amount column was cut off at 1280 px; a welcome toast said "Welcome back, LedgerLine." for the user "LedgerLine Admin".
3. **The AI's browser test reported false failures** (it read the page before React had rendered it) – not app bugs.

**How the issue was identified:** (1) `npm run lint`; (2) the AI drove Chrome headlessly with Playwright, took screenshots and
inspected them; (3) investigating the failures showed the URL changed ~100 ms before the new page rendered.

**How it was corrected:** (1) memoised the value and used a "latest ref" for the fetch function; (2) no-wrap buttons, a compact table
mode, full name in the toast; (3) the test now waits for elements.

**Related commit:** `feat: implement role-based dashboards`

**My review notes:** _(to be completed by me)_

---

## Entry 10 – Money movement pages

**Date:** 2026-11-07

**Prompt given to AI:** "task4" – Deposit, Withdraw, Transfer, Transaction Details and History pages with validation, confirmation,
loading state, clear errors and refreshed balances; never calculate or approve financial transactions in React.

**What AI generated:** one form page for the three operations with a confirmation dialog and receipt; amounts converted to paise by
**moving the decimal point as text** (no floating point); history and details pages; backend `GET /api/transactions/:id` where a holder
sees only the ledger entries on their own accounts (the other side's balance stays private).

**What was incorrect or incomplete:**
1. Wording: "Withdraw of ₹1,000.00 completed", "Review withdraw".
2. A privacy note said "another customer's account", which is wrong for deposits (the other side is the SYSTEM account).
3. **Before idempotency existed**, a network error left the user unsure whether money had moved.

**How the issue was identified:** (1)–(2) screenshots from the AI's browser test; (3) design review – no safe retry was possible yet.

**How it was corrected:** (1) separate noun "withdrawal"; (2) "an account that isn't yours"; (3) the form honestly says the
transaction "may or may not have gone through" and links to history – replaced by a safe retry in Entry 12.
Verified in the browser: the Day 1 scenario through the forms gives ₹5,500.00; a double-click created exactly one transaction.

**Related commit:** `feat: implement deposit withdrawal and transfer interfaces`

**My review notes:** _(to be completed by me)_

---

## Entry 11 – Backend integration

**Date:** 2026-11-07

**Prompt given to AI:** "task5" – connect the frontend to all backend APIs with reusable services; handle 401, 403, 400, 404 and 500;
configure CORS correctly; no hard-coded backend URL.

**What AI generated:** an admin Users page, a balance refresh using `GET /accounts/:id/balance`, an error boundary so a crashing page
cannot blank the whole app, "try again in N seconds" for 429, and stricter CORS (exact origins only, explicit methods and headers).

**What was incorrect or incomplete:**
1. Two backend endpoints had no UI, and nothing caught rendering crashes.
2. `CORS_ORIGIN=*` would have been accepted – with cookies, any website could use a signed-in session.
3. **The AI's mocked 429 test failed** because the fake response lacked `Access-Control-Expose-Headers`.

**How the issue was identified:** (1)–(2) the AI's integration review; (3) the failing browser test – the browser correctly hid the header.

**How it was corrected:** (1) Users page, Refresh button, `ErrorBoundary`; (2) the server refuses to start with `*`; (3) fixed the mock and
added a real-backend check (11 wrong passwords → "try again in 15 minutes").

**Related commit:** `feat: integrate React frontend with backend APIs`

**My review notes:** _(to be completed by me)_

---

## Entry 12 – Idempotent financial transactions

**Date:** 2026-11-07

**Prompt given to AI:** "task6" – an idempotency key per money operation, stored in PostgreSQL with database-level uniqueness, a
request fingerprint, the stored original result; identical retries return it; reused keys with different data are rejected;
simultaneous same-key requests handled; no duplicate money movement; don't rely on the frontend.

**What AI generated:** the key row is inserted **inside the same database transaction as the money movement** under
`UNIQUE(userId, key)`, so two committed movements with one key are impossible; a SHA-256 fingerprint of endpoint + body; replayed
responses marked `Idempotent-Replayed: true`; the key is required by the backend; a "Retry safely" button in the frontend; Jest +
Supertest with a separate `ledgerline_test` database.

**What was incorrect or incomplete:**
1. **The AI broke a project rule:** it ran `git check-ignore` (a read-only Git command) while checking `.gitignore`.
2. The `.env.*` ignore rule would also have hidden the new `.env.test.example` template from Git.
3. All 42 tests passed in 0.7 s on the first run – suspiciously fast; it was not yet proven they could detect anything.

**How the issue was identified:** (1) the AI noticed and reported it immediately; (2) that same check; (3) the AI questioned the result.

**How it was corrected:** (1) no Git commands since; `.gitignore` is read as a file; (2) added `!.env.test.example`; (3) confirmed rows
really appear in the test database and the real database was untouched, then ran a **mutation test**: with the key claim removed,
10 simultaneous deposits created **10 transactions** and 5 tests failed. Code restored. Browser "lost response" test: the server
processed ₹2,500, the answer was dropped, "Retry safely" returned the original result – money moved once.

**Related commit:** `feat: implement idempotent financial transactions`

**My review notes:** _(to be completed by me)_

---

## Entry 13 – Concurrency control and ledger integrity

**Date:** 2026-11-07

**Prompt given to AI:** "task7" – ₹1,000 balance, ₹800 + ₹700 withdrawals at once → only one succeeds; row locking, atomic updates,
consistent lock order, deadlock handling, rollback, no negative balances, balanced and append-only ledger; never claim without verifying.

**What AI generated:** a migration with database-enforced rules – transactions append-only, `TRUNCATE` blocked, a running-balance
chain check on every new entry, commit-time checks that every transaction balances and every balance equals its ledger; retry with a
random wait; 30 concurrency tests and 13 tampering tests.

**What was incorrect or incomplete (in Day 1 code):**
1. `TRUNCATE` bypassed the append-only triggers; the `transactions` table could be edited.
2. Balance = ledger was only checked afterwards, not enforced.
3. The Day 1 deadlock retry had never been tested.

**How the issue was identified:** the AI's review of the triggers and code; then tests – a real PostgreSQL deadlock (opposite lock order)
confirmed the retry logic recognises it. **Mutation test:** with `FOR UPDATE` removed, 21 of 22 race tests failed; a probe showed
both withdrawals reading ₹1,000 and the second writing ₹300 – a lost update that the Day 1 `CHECK` constraint would **not** have caught.

**How it was corrected:** the new triggers; the chain trigger rejected all 9 lost updates in the probe (defence in depth). One AI test
was too loose (it also accepted a "duplicate key" error) and was rewritten to match only the chain-broken message.

**Related commit:** `feat: strengthen concurrency control and ledger integrity`

**My review notes:** _(to be completed by me)_

---

## Entry 14 – Testing and final review

**Date:** 2026-11-07

**Prompt given to AI:** "task8" – test registration, login, protected routes, roles, money pages, history and errors; backend
duplicates, simultaneous withdrawals, unauthorised access, insufficient balance, rollback, ledger consistency; verify the database; fix bugs.

**What AI generated:** a Playwright suite in the project (23 tests), frontend unit tests, five new Jest suites (161 backend tests),
`npm run verify:db`, and scripts that prepare and start the test database.

**What was incorrect or incomplete:**
1. **Concurrency bug:** 10 simultaneous "open account" requests created 7 accounts (limit 5).
2. **The browser-test backend silently used the real database:** the `dotenv` preload ignored `.env.test`.
3. "Session expired" toast shown three times.
4. `crypto.randomUUID()` only exists on HTTPS or localhost.

**How the issue was identified:** (1) a new concurrency test failed; (2) the server started on port 4000 in development mode, so
Playwright timed out instead of running against real data; (3) a browser test; (4) code review.

**How it was corrected:** (1) count inside a transaction that locks the user row; (2) a start script that loads `.env.test` explicitly
and refuses any database not named `ledgerline_test`; (3) the first 401 marks the session ended immediately; (4) a
`crypto.getRandomValues` fallback. The first E2E run also had five failures caused by the AI's own selectors – fixed.

**Related commit:** `test: verify financial transactions and application integration`

**My review notes:** _(to be completed by me)_

---

# DAY 3 – Testing, security, documentation

## Entry 15 – Day 3 review and automated tests

**Date:** 2026-11-07

**Prompt given to AI:** "LedgerLine – Day 3 Final Development Master Prompt" – review everything without blindly trusting earlier AI
code; Task 1: tests for authentication, accounts, transactions and financial integrity on a dedicated test database.

**What AI generated:** new auth and account tests; `tests/invariants.js` – an **independent SQL oracle** for the books (total of all
balances = 0, no negative customer balance, every transaction one matching debit and credit, balance = ledger, running balances);
`financialIntegrity.test.js` (35 tests) including invalid amounts on all three endpoints and a forced rollback.

**What was incorrect or incomplete:**
1. Earlier tests checked the ledger with the app's own `/ledger/verify` code – a bug there would have been trusted.
2. Amount validation was only tested on deposit.
3. `Authorization: Bearer <token> <token>` was accepted.
4. Found in the review, fixed in Task 4: a token still worked after logout; no `trust proxy`.

**How the issue was identified:** (1)–(2) mapping each Day 3 requirement to existing tests; (3) a new malformed-header test failed;
(4) live requests during the review.

**How it was corrected:** the oracle (proven by disabling one trigger on the test database and adding ₹0.01 – reported immediately);
24 amount cases across endpoints; strict `Bearer <jwt>` parsing. Result: 207/207.

**Related commits:** `test: add authentication and account management tests` · `test: add financial transaction integrity tests`

**My review notes:** _(to be completed by me)_

---

## Entry 16 – Idempotency testing

**Date:** 2026-11-07

**Prompt given to AI:** "start task2" – same transfer twice; same key twice; same key with a different amount; identical requests
simultaneously; retry after success. Expected: one transaction, original result on retry, different payloads rejected, consistent data.

**What AI generated:** 11 transfer tests: one transaction for repeated requests; exactly one key row and two ledger entries; 422 for a
different amount, destination, description, account-number form or endpoint; 25 simultaneous identical transfers → 1 transaction;
a retry after the balance changed and the account was frozen still returns the **original** result; a retry served by a freshly
loaded copy of the app is still recognised (keys live in PostgreSQL).

**What was incorrect or incomplete:** the Day 2 idempotency tests mostly used deposits, not transfers (where two accounts change).

**How the issue was identified:** mapping the five required scenarios to existing tests.

**How it was corrected:** the new tests, proven by mutation testing – removing the key claim failed 10 of 11; removing the fingerprint
comparison failed exactly the 5 different-payload tests. No application bug was found. Result: 218/218.

**Related commit:** `test: verify idempotency and duplicate transaction prevention`

**My review notes:** _(to be completed by me)_

---

## Entry 17 – Concurrency testing

**Date:** 2026-11-07

**Prompt given to AI:** "start task 3" – ₹800 + ₹700 against ₹1,000 at once; concurrent transfers and deposits; two transfers on the
same accounts; rollback; deadlocks; genuine concurrency; verify actual PostgreSQL balances and ledger entries; no fake sequential tests.

**What AI generated:** a **proof that requests really overlap** – an outside transaction holds the account lock, 12 withdrawals are sent
with `Promise.all`, and PostgreSQL reports all 12 waiting at the same moment; 40 simultaneous deposits; 30 deposits + 30 withdrawals;
20 transfers to 4 receivers; 30 same-direction transfers; rollback under load – each checked with the oracle.

**What was incorrect or incomplete:** concurrent deposits, many-transfer races and rollback under load were untested, and nothing proved the
`Promise.all` requests overlapped.

**How the issue was identified:** mapping the Day 3 list to existing tests.

**How it was corrected:** the new tests, proven twice – removing `FOR UPDATE` failed all 6; sending the requests one after another made
the overlap test fail with "Expected: 12, Received: 1". No application bug was found. Result: 224/224.

**Related commit:** `test: verify concurrent transaction safety`

**My review notes:** _(to be completed by me)_

---

## Entry 18 – Security review

**Date:** 2026-11-07

**Prompt given to AI:** "start task4" – audit authentication, hashing, roles, ownership, SQL injection, validation, rate limits, CORS,
Helmet, secrets, errors, data exposure, ledger protection, duplicates, replay and privilege escalation; record actual results; fix
confirmed vulnerabilities.

**What AI generated:** 37 security tests, `docs/SECURITY_AUDIT.md`, a `sessionVersion` migration, `TRUST_PROXY`, LIKE-wildcard
escaping, a dependency override, and an updated smoke test.

**What was incorrect or incomplete (in earlier AI code):**
1. A copied token still worked **after logout** (replay).
2. Reactivating a user revived tokens stolen before the deactivation.
3. No `trust proxy`: behind a hosting proxy all clients share one IP (one attacker could lock everyone out of login).
4. Searching for `%` returned every row (LIKE wildcard injection).
5. A high-severity advisory in `deepmerge-ts`, used by the Prisma CLI.
6. Login built its response as "user minus passwordHash", which would have leaked new columns.

**How the issue was identified:** (1)–(3) live requests during the review; (4) a failing security test; (5) `npm audit`; (6) code review
while adding the new column.

**How it was corrected:** a session version in every token, raised on logout and status changes (logout now signs out everywhere –
documented trade-off); `TRUST_PROXY` hops (default 0, `true` forbidden); escaping `\ % _`; an npm `overrides` entry instead of a breaking
Prisma 7 upgrade (`npm audit` → 0); an explicit field allow-list. Mutation tests: 4, 1 and 2 failures when each fix is undone.
Live re-test: copied token after logout → 401. Result: 261/261.

**Related commit:** `security: strengthen authentication and financial access controls`

**My review notes:** _(to be completed by me)_

---

## Entry 19 – Financial security threat model (THREATS.md)

**Date:** 2026-11-07

**Prompt given to AI:** "start task5" – THREATS.md with 13 threats, each with description, attack scenario, impact, prevention,
implemented protection, corresponding test and remaining risks; never claim a fix without code and test proof.

**What AI generated:** a rewritten THREATS.md – summary, 13 detailed sections naming code files and exact passing tests, other covered
threats and all remaining accepted risks.

**What was incorrect or incomplete:**
1. The old THREATS.md had no attack scenarios, impact or test references.
2. Four test titles printed "→ NaN 422" (a `%i` placeholder was filled by a function argument).
3. **The app's database role owns the tables and can disable triggers** – so "tampering is impossible" would have been an overclaim.
4. Brute-force protection is only partial (per-IP, in-memory limits; timing measured manually, not automated).

**How the issue was identified:** (2) collecting exact test names from a Jest JSON report; (3) noticing that the Task 1 oracle check had
disabled a trigger as `ledgerline_app`, then confirming ownership with `pg_tables`; (4) reviewing what the tests actually prove.

**How it was corrected:** fixed the test titles; recorded (3) and (4) honestly as remaining risks with recommended fixes. A script checked
that all 81 quoted test names exist in a fresh 261/261 Jest run or in the Playwright specs.

**Related commit:** `docs: add financial security threat model`

**My review notes:** _(to be completed by me)_

---

## Entry 20 – Restructuring this log

**Date:** 2026-11-07

**Prompt given to AI:** "start task6" – PROMPTS.md with at least five dated entries containing date, prompt, what AI generated, what was
incorrect or incomplete, how it was identified, how it was corrected and the related commit; at least two entries on financial integrity,
idempotency or concurrency; no invented mistakes or commit links.

**What AI generated:** this restructured log – the same 19 entries rewritten into one consistent format, an index, and a commit table.

**What was incorrect or incomplete:** the earlier entries used different headings ("Problems found", "AI-generated solution"), mixed
the AI's findings with first-person wording, and had empty "My corrections" placeholders. Commit hashes were unknown to the AI.

**How the issue was identified:** comparing the existing file with the Day 3 Task 6 requirements.

**How it was corrected:** every entry now uses the required headings; attribution is explicit (what found each issue and who ran it);
facts were kept from the original entries without adding new ones; hashes are left for me to fill in from `git log`.

**Related commit:** `docs: complete README and API documentation` (this log was committed together with Task 7)

**My review notes:** _(to be completed by me)_

---

## Entry 21 – README and API documentation

**Date:** 2026-11-07

**Prompt given to AI:** "start task 7" – a professional README (20 required sections: overview, problem statement, features, stack,
architecture, database schema, authentication and transaction workflows, idempotency, concurrency, ledger integrity, API endpoints,
installation, environment variables, testing, deployment, demo credentials, screenshots, limitations) and API documentation (method,
endpoint, request body, authentication, role, response, error codes); only safe dummy credentials in the public repository.

**What AI generated:** a rewritten `README.md` with all 20 sections and four Mermaid diagrams; `docs/API.md` covering all 21 endpoints with
**real responses** captured from the running API; `backend/prisma/seed-demo.js` (`npm run db:seed:demo`) with dummy `example.com` users
and a demo history moved through the real transaction service with fixed idempotency keys; 12 screenshots in `docs/screenshots/`.

**What was incorrect or incomplete:**
1. The old README described the project as "a backend" and was missing most required sections.
2. **The AI's first demo seed** used a ₹9,99,999 withdrawal to show "insufficient funds", but it was refused as `AMOUNT_EXCEEDS_LIMIT`
   (over the ₹5,00,000 limit).
3. **The AI's first screenshot script** had no way to get the receiver's account number and stopped halfway.
4. Full-page screenshots cut the fixed sidebar off at 800 px.
5. **The AI wrote two values in `docs/API.md` from memory** (a counterparty account number and an entry number) that did not match the
   captured responses.

**How the issue was identified:** (1) comparing the README with the 20 required sections; (2) the seed's own output; (3) reviewing the
script before running it; (4) looking at the screenshots; (5) checking the example against the captured JSON.

**How it was corrected:** (2) ₹3,000 from ₹1,700 with a new key (the second seed run replayed every earlier step – idempotency in the seed
itself); (3) read the number from the demo database first; (4) a taller window instead of full-page capture; (5) replaced both values with
the captured ones, and wrote the insufficient-funds message as a format instead of an uncaptured number.

**How it was verified:** a **fresh install** on a new, empty database following the README steps (4 migrations, seed, demo seed,
`verify:db` 13/13); all 4 Mermaid diagrams parsed and rendered with the real Mermaid library in Chrome; every local link and image in
README, API.md and THREATS.md resolves; no real secret appears in any document. The temporary demo database was deleted afterwards.

**Related commit:** `docs: complete README and API documentation`

**My review notes:** _(to be completed by me)_

---

## Entry 22 – Deployment configuration (Vercel, Render, Neon)

**Date:** 2026-11-08

**Prompt given to AI:** "start task8" – deploy the frontend to Vercel, the backend to Render and the database to a managed PostgreSQL
service; verify login, deposit, withdrawal, transfer, history, idempotency and concurrency against the deployed environment; diagnose the
actual error if deployment fails before claiming success.

**What AI generated:** `render.yaml` (Render Blueprint), `frontend/vercel.json` (`/api/*` rewrite to Render, SPA fallback, security
headers), a matching `vite preview` setup in `frontend/vite.config.js`, `backend/scripts/verify-deployment.js` (24 live checks),
`backend/scripts/prepare-production-db.js` (`npm run db:prepare:production`), `docs/DEPLOYMENT.md`, and updates to README and THREATS.md.

**What was incorrect or incomplete:**
1. `prisma` is a devDependency, so the normal production install (`npm ci`) would have had no Prisma CLI for `migrate deploy`.
2. **The AI's verification script** first required HTTPS, so it could not be used for the local rehearsal.
3. A leftover test server from Task 4 was still holding port 4001 and made the regression run fail.

Risks handled by design (not mistakes): the browser would not send the `SameSite=Strict` cookie from `vercel.app` to `onrender.com`
(so `/api` is rewritten through Vercel); behind two proxies all users would share one rate-limit bucket (`TRUST_PROXY=2`); the private
local admin must not reach production (`prepare-production-db.js` reads only `backend/.env.production`, clears `SEED_*`, refuses a
localhost URL and prints only the host).

**How the issue was identified:** (1) the local production rehearsal with a clean copy, no `.env` and an empty database; (2) the
script's own first run; (3) `lsof` on the port.

**How it was corrected:** (1) build command `npm ci --include=dev`; (2) an explicit localhost-rehearsal exception (anything else still
needs HTTPS); (3) stopped the old process and re-ran the suites.

**How it was verified:** local production rehearsal – clean install, `NODE_ENV=production`, fresh database, production frontend build
behind `vite preview` with the same headers and `/api` forwarding: `verify-deployment.js` **24/24**; Chrome showed no CSP violations or
JavaScript errors and all six security headers; both safety refusals of `prepare-production-db.js` tested. Regression after the
rehearsal: Jest 261/261, Playwright 23/23, lint clean. **The live deployment is not verified yet** – it needs the Vercel and Render
accounts, which only I can create.

**Related commit:** `chore: finalize deployment configuration`

**My review notes:** _(to be completed by me)_

---

## Entry 23 – First-admin bootstrap and password change (updated problem statement, step 1)

**Date:** 2026-11-11

**Prompt given to AI:** the updated problem statement (secure account management, onboarding, role-based access, auditable
operations), step 1: "First-admin bootstrap and secure authentication. First inspect the existing implementation and give me a clear
gap analysis. Wait for my approval before modifying files."

**What AI generated:** `backend/src/services/adminBootstrap.service.js` and `backend/scripts/bootstrap-admin.js`
(`npm run admin:bootstrap`); `POST /api/auth/change-password`; a Profile page with a change-password form; `SEED_DEMO_ADMIN` so the
demo admin is never created on production; empty `SEED_*` values in `.env.example`; an audit entry for seeded users; updated
`verify-deployment.js`; `tests/integration/bootstrap.test.js` (14 tests), 6 change-password tests, 1 Playwright and 1 unit test.

**What was incorrect or incomplete:**
1. **Found in the gap analysis (earlier AI code):** the deployed site contained `demo.admin@example.com`, whose password
   `DemoPass123` is published in the README – anyone could sign in as admin.
2. `seed.js` created an admin whenever the configured email was new, so it could silently add a second admin; admin creation was not
   audited; `.env.example` contained an admin password that passes the password rules.
3. Nobody could change their own password.
4. **The AI's first concurrency test was too weak:** "5 runs at the same moment → 1 admin" still passed with the database lock
   removed, because the runs happened not to overlap in time.
5. **The AI's first Playwright test** used a selector that matched the email twice (sidebar and profile card).

**How the issue was identified:** (1)–(3) reading `seed.js`, `seed-demo.js`, `auth.routes.js` and logging in to the live backend as
the demo holder; (4) mutation testing – removing the lock left all tests green; (5) the Playwright run (strict-mode violation).

**How it was corrected:** (1)–(2) a bootstrap command that refuses when an active admin exists or the email is taken, takes the password
at a hidden prompt, uses a transaction advisory lock, writes `ADMIN_BOOTSTRAP` in the same transaction, and with
`--replace-demo-admin` deactivates the demo admin in that same transaction; (3) change password with the current password, revoking
all other sessions; (4) a new test where another transaction holds the lock and the bootstrap must wait; (5) the selector is limited to
the main area.

**How it was verified:** backend 281/281 (14 suites), frontend unit 13/13, Playwright 24/24, frontend lint clean, production build OK.
Mutation tests: lock removed → 1 failure (the new wait test); active-admin check removed → 5 failures; no session revocation on
password change → 1 failure. The hidden prompt was checked in a real terminal (`expect`): the typed password appears 0 times in the
output. **Not yet done:** running the bootstrap against the production database (needs my approval and my password).

**Related commit:** `feat: add secure first-admin bootstrap and password change`

**My review notes:** _(to be completed by me)_

---

## Entry 24 – Separate PostgreSQL roles and the direct migration connection (step 2)

**Date:** 2026-11-11

**Prompt given to AI:** "Start Step 2 – Separate PostgreSQL database roles and permissions. Also fix the Neon database connection
configuration so Prisma migrations use the direct connection. First inspect the existing implementation…" – then "approve step 2,
option A … local code changes and tests only".

**What AI generated:** `backend/scripts/setup-db-roles.js` (`npm run db:roles`), `directUrl` in `schema.prisma`, the two-URL layout
in `.env.example` / `.env.test.example`, owner-connection helpers for tests, `tests/integration/dbRoles.test.js` (43 tests), a 14th
check in `verify-db.js`, stricter `prepare-production-db.js` and `prepare-test-db.js`, `render.yaml` without migrations (option A),
and documentation.

**What was incorrect or incomplete:**
1. **Found in the inspection:** the API connected as the owner of every table – locally `ledgerline_app`, on Neon `neondb_owner`
   (member of `neon_superuser`, CREATEROLE, BYPASSRLS) – so it could disable the ledger triggers; migrations ran through Neon's pooler.
2. **The AI's first role script** used `ALTER ROLE … NOSUPERUSER` on re-runs; PostgreSQL refuses that from a non-superuser even when
   nothing changes (42501), so the second run failed.
3. **The AI's first connection cap (20)** was too low: Prisma's default pool is about 2 × CPU cores + 1 per process, and the test
   suite's simultaneous requests failed with "too many connections for role ledgerline_api" (9 failing tests).
4. Six existing tests created fault-injection triggers or tampered with tables through the app's connection; as the limited role
   PostgreSQL refused them.
5. **Found on the first production run (P2, 2026-11-12):** the AI's script sent the role password as a pre-computed SCRAM hash. Local
   PostgreSQL accepts that, but Neon's control plane rejected it ("Neon only supports being given plaintext passwords"). The error came
   at the first statement inside the transaction, so nothing was created – checked read-only afterwards: no `ledgerline_api` role, 0 grants.
6. **Found on the second production run:** the role transaction used Prisma's default 5-second limit. On Neon each statement is a
   network round trip (~130 ms) and CREATE ROLE goes through the control plane, so the transaction was cut off ("Transaction not
   found") and rolled back – again checked read-only: no role, 0 grants.

**How the issue was identified:** (1) read-only queries on both databases (`current_user`, table owners, role attributes, memberships);
(2) running the script twice; (3)–(4) the full test run; (5)–(6) the error messages of the production runs.

**How it was corrected:** (1) a separate `ledgerline_api` role with only row privileges and the owner only in `DIRECT_DATABASE_URL`;
(2) re-runs set only attributes the owner may change, and the report fails if any special attribute is on; (3) cap 50, plus
`connection_limit` in the production URL; (4) an explicit owner connection (`ownerDb()`) for those tests – the tamper tests now prove
that the triggers stop even the owner, and `dbRoles.test.js` proves the API role cannot try; (5) for `*.neon.tech` hosts the password
is sent as plain text over TLS (refused without `sslmode=require`), elsewhere still as a SCRAM hash, and passwords and connection strings
are removed from every error message; (6) a 60-second limit for the (still single, all-or-nothing) role transaction, and the
script prints how long it took.

**How it was verified:** backend 324/324 (15 suites, after fixes 5–6), Playwright 24/24, frontend unit 13/13, smoke test 56/56 against a dev server
running as `ledgerline_api`, `verify:db` 14/14 (and the new check fails when connected as the owner). Mutation tests: DELETE on
`ledger_entries` granted → 2 failures; UPDATE on `transactions` → 1; unlisted-table check removed → 1. The API started and served
login without `DIRECT_DATABASE_URL` (as on Render), and `prisma generate` ran without any database variables. Both production commands
refused the old `.env.production` without connecting. Fix 5: 10 new tests; mutations (host check loosened → 2 failures, redaction
removed → 1, plain text never chosen → 3, sslmode check removed → 1). Local PostgreSQL uses "trust" authentication, so password checks
can't be tested there; checked once by hand as superuser with a temporary role: in plain-text mode PostgreSQL stored a SCRAM hash (not
the password), the new password verified against it and the previous one did not – also on re-runs (ALTER ROLE). Fix 6: a test that slows the role transaction to 6 s still commits with exactly the planned
privileges; with the limit removed it fails with "The timeout for this transaction was 5000 ms".

**Production (2026-11-12, each step approved separately):**
- P1: `backend/.env.production` rewritten with the two URLs (API role on the pooled host with `pgbouncer=true&connection_limit=5`,
  owner on the direct host); an offline checker passed 15/15 without connecting or printing secrets.
- P2: `npm run db:roles -- --production` – failed twice (fixes 5 and 6, nothing was created either time, checked read-only), then
  succeeded: the role transaction took 4.0 s on Neon, all 7 tables and the role attributes ✅. Checked as `ledgerline_api`: login
  through the pooler works, data readable, the bootstrapped admin is still the only active admin, 6 dangerous statements refused.
- P3 (done by me): Render `DATABASE_URL` switched to `ledgerline_api`, start command `npm start`, code pushed and deployed.
- P4: `/api/health` 200 with database `ok`; on Neon the only app connection is `ledgerline_api` (via pgbouncer); demo admin still
  disabled, my admin still active; `verify-db` 14/14 as `ledgerline_api` (before and after the live run); frontend
  https://ledger-line-umber.vercel.app – HTTPS, CSP/HSTS/nosniff/X-Frame-Options, SPA deep link, `/api` rewrite, http→https 308,
  401 without login; `verify-deployment` **25/25** (deposit, withdrawal, transfer, history, idempotent replay and 5 simultaneous
  duplicates, reused key → 422, the ₹800 + ₹700 race → 201 + 422, ledger verified, balances sum to ₹0). The live run permanently added
  1 test user, 3 accounts and 6 transactions (simulated money; the ledger is append-only).
- **Not done:** a readiness endpoint (planned for step 3); my own browser walkthrough of the live site.

**Related commit:** `security: run the API as a limited database role`

**My review notes:** _(to be completed by me)_

---

## Entry 25 – Redis rate limiting, per-account lockout and readiness checks (step 3)

**Date:** 2026-11-12

**Prompt given to AI:** "ready" (start step 3: inspect first and explain the plan) – then "approve step 3, option A, lockout yes"
(option A: sign-in fails closed and the rest of the API fails open when Redis is down; plus a per-account lockout).

**What AI generated:** `backend/src/config/redis.js` (connection, timeouts), `backend/src/middleware/rateLimiters.js` (all limiters
with a Redis store, fail-closed wrapper, account key = SHA-256 of the normalised email), `backend/src/services/readiness.service.js`
and `GET /api/health/live` · `/api/health/ready`, `backend/src/config/schemaRequirements.js` (one trigger/constraint list shared with
`verify-db.js`), Redis required at production startup in `server.js`, new env variables (`REDIS_URL`, `REDIS_KEY_PREFIX`,
`AUTH_ACCOUNT_FAILURE_LIMIT`), Jest setup for a local Redis (per-file key prefix, cleanup), 4 new test files (20 tests), `render.yaml`
(health check `/api/health/ready`, `REDIS_URL`) and documentation. Packages pinned exactly: `rate-limit-redis@6.0.2`, `redis@6.3.0`
(6.3.1 was skipped because it was released only 14 days earlier).

**What was incorrect or incomplete:**
1. **Found in the inspection:** counters lived in server memory – every restart or deploy gave an attacker 10 fresh guesses, and a
   second instance would have had its own counters. There was no per-account limit and no readiness check.
2. **A false statement by the AI (step 2):** `render.yaml` said "If a migration is missing, the readiness check will report it" – no
   readiness check existed.
3. **The AI's first Redis client waited up to 2 s for a connection on every command.** With Redis down, each request waited once per
   limiter: a login took 5.9 s, and every API call would have become slower during an outage.
4. **The AI's first shutdown used `destroy()`,** which cancelled commands still in flight (the counter update after a response) and made
   a test fail with "Disconnects client"; a client still connecting was not closed at all, so Jest never exited.
5. **Counters were shared between test files** (all used the same prefix and IP), so `rateLimit.test.js` got 429 on its first request.
6. **Existing tests that load a second copy of the app** (`security.test.js`, `idempotency.test.js`) left that copy's Redis connection
   open – the full suite passed but Jest never exited.
7. **The AI's process mistakes while testing:** it used `timeout`, which does not exist on macOS, so one batch of tests silently did not
   run at all; it wrote a stray file to `/tmp`; and it put a `git diff` command into a test script, against the rule that the AI never
   runs Git. The run was stopped before that line executed, and the script was rewritten without it.

**How the issue was identified:** (1)–(2) reading the code and `render.yaml`; (3) a timing assertion in `redisDown.test.js`
(5878 ms); (4)–(6) the test output, then listing the process's open sockets after every test file; (7) empty output and reviewing
the script.

**How it was corrected:** (1) Redis store for all limiters, a per-account limiter, `/api/health/live` and `/api/health/ready`; (2) the
comment now describes the real readiness check; (3) commands wait only until the first connection attempt succeeds *or fails* – after
that they fail at once; (4) graceful `close()`, `destroy()` only for a client that is still reconnecting, after waiting for the first
attempt; (5) a random key prefix per test file (`ll:test:<random>:`), old test keys deleted before each run; (6) those tests now close
their copy's Redis connection; (7) `perl -e 'alarm …'` as the time limit, the stray file deleted, no Git in any script.

**How it was verified:** backend **344/344** (19 suites, Jest exits on its own), Playwright 24/24 (its backend uses the test Redis),
frontend unit 13/13, frontend lint clean, `verify-db` 14/14 locally. Mutation tests – each made tests fail: login limits failing open
(1), the account limiter removed (5), counters in memory instead of Redis (3), emails not normalised (1), waiting for a full connection
on every command (2), health routes rate limited again (3), the dbRole check disabled (1), production starting without Redis (1),
readiness revealing error text (5). Started by hand in production mode: without `REDIS_URL` → exit 1; Redis unreachable → exit 1
after 10 s, the password in the URL not printed; with Redis → readiness 200, SIGTERM → exit 0. Captured from a local server with Redis
stopped: readiness 503 `redis: failed`, login 503 `SERVICE_UNAVAILABLE`.

**Production (2026-11-12, each step approved separately):** R1–R2 (done by me): Render Key Value `ledgerline-redis` (Free, Singapore,
`noeviction`, internal only) and `REDIS_URL` on the API; the live site stayed healthy. R3 (done by me): commit `7c324eb` pushed and
live. R4: `/api/health`, `/live`, `/ready` all 200 with `database`, `redis`, `schema`, `dbRole` = `ok`; 20 quick readiness requests
all 200 (not rate limited); only `ledgerline_api` connections on Neon; `RateLimit-Policy "600-in-15min"` with counts carried across
requests in Redis; frontend and rewrite OK; `verify-db` 14/14; `verify-deployment` **25/25** (logins and registration through the
Redis-backed limiters). Not done on purpose: triggering the login/account/registration limits on production. Observation: my requests
were counted under up to three client keys (IPv6 vs. two IPv4 addresses) – consistent with my network, not confirmed externally.

**Related commit:** `feat: add Redis rate limiting, account lockout and readiness checks`

**My review notes:** _(to be completed by me)_

---

## Entry 26 – Registration and onboarding with automatic approval (step 4)

**Date:** 2026-11-12

**Prompt given to AI:** "approve step 4, option A, fields as proposed" – automatic approval after a valid profile (date of birth,
phone, city, state, PIN code, occupation) and terms acceptance; a clear warning not to enter real personal data; no accounts or
transactions before approval; keep all existing users and data; backend and Playwright tests; record the step 3 production results.

**What AI generated:** migration `20261112120000_customer_onboarding` (enums, four columns on `users`, `customer_profiles`, CHECK
constraints, triggers `users_onboarding_requires_profile` and `accounts_owner_onboarded`, existing users set to `APPROVED`);
`src/config/onboarding.js`, `src/utils/schemas/onboarding.schemas.js`, `src/services/onboarding.service.js`, controller and
`GET/POST /api/onboarding`; `src/middleware/requireOnboarded.js` on account and money routes; `onboardingStatus` in the session user
and public user fields; `customer_profiles` (SELECT, INSERT) in `setup-db-roles.js`; the new triggers/constraints in readiness and
`verify-db` (15th check: every account owner onboarded); seeds and `admin:bootstrap` create staff approved and demo holders with a fake
profile; frontend `OnboardingPage` (demo warning, two steps, terms), `OnboardingNotice`, `OnboardingGate`, navigation and redirect
after registration; `tests/integration/onboarding.test.js` (33 tests), `frontend/e2e/onboarding.spec.js` (3), 2 frontend unit tests;
onboarding in `verify-deployment.js` (27 checks) and the smoke test (61); documentation.

**What was incorrect or incomplete:**
1. **Found in the inspection:** a new user could open accounts and move simulated money immediately after registering – no profile,
   no terms, no status.
2. **Two existing tests broke for intended reasons:** a CSRF test opened an account with a freshly registered (not onboarded) user, and
   the `/me` field allow-list did not include `onboardingStatus`. The registration browser test expected the dashboard instead of
   `/onboarding`. All three were updated to the new behaviour, keeping what they test.
3. **Two mutations survived:** removing the "already complete" check or the row lock still gave 409, because the one-profile-per-user
   primary key catches the second submission. Kept as defence in depth and documented; removing that mapping too made 2 tests fail.
4. **A gap found while writing the rollout steps:** between the migration and the new deploy, a user who registers on the old version
   cannot onboard and gets a 500 when opening an account (the new trigger). Documented in docs/DEPLOYMENT.md; the window must be short.
5. **The AI's own test mistake:** "You must be at least 18 years old" matched both the page subtitle and the error (Playwright strict
   mode) – the test now matches the error text exactly.
6. **Found after the production migration (S1):** the AI had told me the demo seed would "replay, not duplicate" its transactions. That
   was wrong after 24 hours: idempotency keys expire, so `db:prepare:production` ran the 7 demo transactions **again** on production
   (simulated money, demo accounts only; one formerly refused withdrawal now succeeded). The rehearsal missed it because local keys
   were recent. Found by comparing production with the pre-S1 snapshot (transactions 27 → 34). I accepted the rows (not deleted, not
   reversed) – details in docs/DEPLOYMENT.md, "Accepted: 7 duplicated demo transactions". A seed fix is planned.

**How the issue was identified:** (1) reading `auth.service.js` and the routes; (2)–(3), (5) test runs and mutation tests; (4) thinking
through the deploy order.

**How it was corrected:** see "What AI generated"; (2) tests onboard the user first or expect the new field / page; (3) documented;
(4) documented procedure "migrate, then push at once" – readiness blocks the reverse order.

**How it was verified:** backend **377/377** (20 suites), Playwright **27/27**, frontend unit 15/15, frontend lint clean, production build
OK, smoke test 61/61, `verify-db` 15/15 on the development database after the migration, local rehearsal of `verify-deployment`:
25 of 27 – the two failures are local-only (the development database has the demo admin on purpose; cookies are not `Secure` over
local http), the 2 new onboarding checks passed. Mutation tests – each made a test fail: guard removed from opening accounts (1) or
transfers (1), guard letting everyone through (4), extra fields allowed (1), no minimum age (1), any terms version (1), personal data
in the audit log (1), the account trigger disabled on the test database (1). Real API responses captured for docs/API.md.

**Production (2026-11-12, each step approved separately):** a safety review first – read-only checks (4 earlier migrations, no name
conflicts) and a snapshot of production; a rehearsal on a copy of the development database (all data fingerprints identical, ~1 s); a
deliberately broken copy proved that a failed migration leaves nothing behind (`migrate resolve --rolled-back` then re-applies cleanly);
an emergency rollback script tested on a copy. I created the Neon branch `pre-step4` as a restore point. S1 (run by me):
`db:prepare:production` – migration applied, `customer_profiles` privileges set, `verify-db` 15/15. Compared with the snapshot, all
existing users, transactions, ledger entries and audit records were identical – but 7 demo transactions were added (mistake 6). S2:
commit `03a450d` pushed by me and live. S3 (read-only): `/api/onboarding` 401 instead of 404, readiness all `ok`, 15/15, only
`ledgerline_api` connections, the live bundle contains the onboarding page and the demo warning. **Not done yet:** the 27 live checks.

**Related commit:** `feat: add customer onboarding with automatic approval`

**My review notes:** _(to be completed by me)_

---

## Entry 27 – Demo seed: create demo transactions only once; production demo seeding opt-in

**Date:** 2026-11-12

**Prompt given to AI:** "approve seed fix" – prevent duplicate demo transactions even when idempotency keys expire, make production
demo seeding opt-in with `--with-demo`, regression tests for expired and missing keys, document the 7 accepted transactions.

**What AI generated:** `prisma/seed-demo.js` – demo transactions only if neither demo holder has any transaction yet; the seed is now a
function (`seedDemo`) that tests can call with their own demo users. `scripts/prepare-production-db.js` – an explicit step list
(`productionSteps`), the demo seed only with `--with-demo`, unknown options refused. `tests/integration/seedDemo.test.js` (8 tests).
Documentation: docs/DEPLOYMENT.md (the 7 transactions, the fix, `--with-demo` in the setup steps), README, THREATS (accepted risk 4),
PROJECT_SUMMARY.

**What was incorrect or incomplete:**
1. **The original seed (and the AI's claim about it):** "a re-run replays instead of duplicating" relied on idempotency keys, which
   expire after 24 hours – on production the re-run executed all 7 demo operations again (Entry 26, mistake 6).
2. **The production script ran the demo seed every time,** so preparing the database for a migration also touched demo data.
3. **While writing the tests, the AI first wrote a "visitor" test that only repeated the deleted-keys case** with a confusing
   comment; it was replaced by a real visitor scenario (a demo holder who made a deposit through the API, no seed ever ran).

**How the issue was identified:** (1)–(2) the post-S1 snapshot comparison on production; (3) reviewing the test before running it.

**How it was corrected:** (1) the "no transactions yet" rule – independent of keys; (2) `--with-demo`; (3) the rewritten test.

**How it was verified:** `seedDemo.test.js` 8/8; with the old behaviour restored (guard removed) the tests for **expired keys**,
deleted keys, the visitor and the immediate re-run fail (4); the demo seed always in the production steps → 1 failure; unknown options
ignored → 1 failure. The real `npm run db:seed:demo` on the development database printed "skipped" and left 158 transactions at 158.
Backend 385/385 (21 suites), `verify-db` 15/15 locally. The typo check was tried only with `--with-demos`, which stops before reading
`.env.production` – the production script was **not** run. Frontend not affected (not re-run). **Nothing changed on Neon or Render**;
the scripts run only from my computer, so this needs a commit but no deploy.

**Related commit:** `fix: create demo transactions only once and make production demo seeding opt-in`

**My review notes:** _(to be completed by me)_

---

## Entry 28 – Admin dashboard, user management and staff management (step 5)

**Date:** 2026-11-12

**Prompt given to AI:** "Start Step 5 — Admin Dashboard, User Management and Staff Management … complete ALL Step 5 development tasks
in one continuous workflow" – secure role assignment, backend and frontend authorization, audit logging, migrations and restricted-role
permissions, tests, Step 4 production results in docs/DEPLOYMENT.md; no Git, no production changes.

**What AI generated:**
- Migration `20261112180000_staff_management`: `users.mustChangePassword`; triggers `users_role_transition`, `accounts_owner_is_holder`
  and the deferred `users_keep_one_active_admin`. Rollback scripts in `backend/prisma/rollbacks/` for step 5 and (copied from the S1
  review) step 4.
- Backend: `adminOverview.service.js` (GET /api/admin/overview), `user.service.js` (details with minimised personal data, status with
  reason, "sign out everywhere", admin roster lock), `staff.service.js` (list, create with a temporary password, ADMIN ↔ AUDITOR, own
  password re-checked), new routes and schemas, permissions `admin:overview` and `staff:manage`, the `PASSWORD_CHANGE_REQUIRED` gate in
  `authenticate.js`, `mustChangePassword` cleared by a password change; the new triggers in readiness; `verify-db` 16th check
  ("No staff member owns a customer account"); a 28th live check (admin pages refused to holders).
- Frontend: new admin dashboard, users page (onboarding filter, reasons, links), user details page, staff page (create, temporary
  password once, role change with password), forced password change (redirect to Profile), navigation and permissions.
- Tests: `tests/integration/adminManagement.test.js` (30), `frontend/e2e/admin.spec.js` (5), 1 frontend unit test.

**What was incorrect or incomplete:**
1. **Found in the inspection:** no staff management at all (staff only via seed or bootstrap), no user details, no reason or "sign out
   everywhere", a dashboard made of 5 list requests, and nothing in the database preventing a holder from being made an admin or
   the last admin from being removed.
2. **The new last-admin trigger broke the bootstrap tests** – they deliberately create "no active admin" (a fresh installation). Only
   their setup now switches the guard off briefly as the owner; the bootstrap itself runs with it on, which also proves that
   `--replace-demo-admin` works with the deferred trigger.
3. **The staff list was ordered oldest first** – a newly created staff member was not on page 1 (found by the browser test). Now
   newest first, with a search box.
4. **The AI's own test mistakes:** a concurrency test assumed the losing request always gets 403 (it can be 401 if it starts after the
   other committed) – it now accepts both, the invariant "exactly one stays active" unchanged; a test stored a non-bcrypt password
   value (would have broken the "every password is bcrypt" check) – replaced; "Pending" matched a user's name in a browser test.
5. **The AI formatted a file with Prettier's defaults** (semicolons, double quotes – not the project's style); it was reformatted to
   the project's style. And a quick check started the app with Redis connected and never exited – stopped and done differently.
7. **A mutation run left the test database broken:** with the last-admin trigger switched off on purpose, the test "a transaction
   that leaves NO active admin…" really deactivated every admin – including the seeded `admin@test.local` – and did not restore
   them, so 6 Playwright tests failed later. Found by checking the seeded admin after the failure; the test now restores the admins
   in `finally`, and the same mutation still makes it fail.
6. One existing test updated for an intended change: the `/me` field list (`mustChangePassword`). A deliberate behaviour change
   without a broken test: setting a user to the status they already have now answers `409 STATUS_UNCHANGED` (it used to "succeed"
   and revoke their sessions).

**How the issue was identified:** (1) reading the code; (2)–(4) test runs; (5) checking the formatted file and the hanging command;
(7) the failing browser tests and the seeded admin's state.

**How it was corrected:** see above.

**How it was verified:** backend **415/415** (22 suites), Playwright **32/32**, frontend unit 16/16, lint clean, production build OK,
`verify-db` 16/16 on the development database. Mutation tests – 11, each made tests fail: auditors allowed to manage staff, no password
confirmation, own role changeable, holder-promotion check removed (the trigger still refuses it), temporary password not blocking,
temporary password in the audit log, acting admin not re-checked in the lock, role change keeping sessions, phone not masked, new
staff without forced change, last-admin trigger disabled. Migration rehearsed on a copy of the development database (rollback script
run first): all data identical, 16/16. Production checked read-only: 0 staff own customer accounts, 1 active admin, step 5 not
applied. **Not done:** anything on production (migration, deploy) – waiting for my approval.

**Related commit:** `feat: add admin dashboard, user management and staff management`

**My review notes:** _(to be completed by me)_

---

## Entry 29 – Tamper-evident audit trail, security events, password rules (step 6)

**Date:** 2026-11-12

**Prompt given to AI:** "Start Step 6 — Audit and Security Improvements … inspect … strengthen audit integrity, administrative action
logging, sensitive-data protection and access controls … migrations and rollback scripts … tests that deliberately break safeguards …
one consolidated deployment plan covering BOTH Steps 5 and 6" – local databases only, no Git, no production.

**What AI generated:**
- Migration `20261112210000_audit_hash_chain` (+ rollback script): `chainSeq`, `prevHash`, `hash` on `audit_logs`; `audit_row_hash`,
  trigger `audit_logs_chain` (advisory lock, gapless, values set by the database), `audit_chain_problems()`; existing records chained
  in their original order without changing their content.
- `GET /api/audit-logs/verify`; audit log filters `entityType`, `from`, `to`; newest-first by `chainSeq`.
- `audit.service.js`: redaction of password/token/cookie/session keys at any depth, long text cut.
- New security events: `AUTH_SESSION_REJECTED` (revoked or deactivated sessions), `AUTH_RATE_LIMITED`, `AUTH_RATE_LIMIT_UNAVAILABLE`,
  `USER_VIEW_DETAILS`.
- Password rules: a blocklist of very common passwords and no email name inside the password (registration, change-password,
  bootstrap).
- `verify-db` check 17 (chain intact), readiness requires the chain trigger, a 29th live check.
- Frontend: "Audit trail integrity" card (audit log page, admin and auditor dashboards), new filters (entity, dates, categories),
  chain number column, labels for the new actions.
- Tests: `tests/integration/auditSecurity.test.js` (21), assertions in `rateLimit.test.js` and `redisDown.test.js`,
  `frontend/e2e/audit.spec.js` (3); a `toJson` test helper.
- docs/DEPLOYMENT.md: one plan for steps 5 + 6 (order, pre-flight, compatibility window, verification, rollback).

**What was incorrect or incomplete:**
1. **Found in the inspection:** the audit log was append-only, but someone with the owner password could still change or delete rows
   undetected; secrets were kept out of metadata only by each caller's care; revoked-token use, sign-in blocks and admins' access to
   personal data were not recorded; common passwords like `Password123` were accepted.
2. **Three existing tests broke** because they `JSON.stringify` audit rows, which now contain a BigInt – fixed with a BigInt-safe
   helper rather than patching `BigInt.prototype` globally (that could hide a real leak).
3. **The AI's fail-closed audit write was not awaited**, so a test counted before the records existed (1 instead of 3) – now awaited.
4. **The AI's first mutation round was invalid:** the "chain does not link" mutation left broken records in the test database, so every
   later mutation also failed for that reason. The chain was repaired (test database only) and all mutations re-run with a clean-chain
   check before each – every one then failed only its targeted test(s).
5. **One unexplained slow run:** one full backend run took 170 s (an idempotency test hit the 30 s timeout); three later runs took about
   40 s and passed, and watching PostgreSQL's locks during a combined run showed no waiting on the chain lock. Not reproduced – recorded
   as an observation.
6. **The AI's own mistakes:** a wrong test for the email rule (it used part of a uuid segment instead of a whole name part); an
   invented example (`"records": 1450`) in docs/API.md, replaced by placeholders; a count query in the rehearsal that compared UTC
   timestamps with local time (it printed 0 – not used as evidence); and an attempted read-only query on **production** although step 6
   was local-only – it was blocked by the tool's permission check and not repeated; the production checks are now a pre-flight step
   that needs approval.

7. **Found by the local rehearsal of the live checks:** `verify-deployment.js` registered `deploy-check-…@example.com` with the
   password `Deploy123check` – which contains "deploy" and "check" from its own email, so the new rule refused it and the 29 live
   checks would have failed on production. The script now uses a password unrelated to the email. The same rehearsal also hit the
   development server's registration limit (10 per hour, kept in Redis across restarts – step 3 working as intended); that one local
   counter was deleted from the development Redis before re-running.

**How the issue was identified:** (1) reading the code; (2)–(3) test runs; (4) the chain-problem count after the first round;
(5) timing; (6) test failures, review, and the blocked command; (7) the local rehearsal (26 then 27 of 29).

**How it was corrected:** see above.

**How it was verified:** backend **436/436** (23 suites), Playwright **35/35**, frontend unit 16/16, lint clean, production build OK,
smoke test 61/61, `verify-db` 17/17 (development database), local rehearsal of `verify-deployment` 27/29 (the two
local-only failures as before: demo admin present, no `Secure` cookie over http; the new audit check passed with 1037 chained records). Mutation tests on a clean test database – each made the
targeted test(s) fail: chain trigger not linking (8), no lock (1 – the concurrent-writers test), verification ignoring content (2) or
gaps (1), redaction off (1), rejected sessions not recorded (2), personal-data view not recorded (1), common passwords allowed (6),
email name allowed at registration (1) or change-password (1), verify endpoint always 200 (1), rate-limit blocks not recorded (1).
Steps 5 + 6 rehearsed together on a copy of the development database rolled back to the step 4 state: all data identical, 17/17,
readiness ok, login and deposit worked. **Not done:** anything on production.

**Related commit:** `feat: add tamper-evident audit trail and security event logging`

**My review notes:** _(to be completed by me)_

---

## Commit references

The AI cannot know commit hashes and did not run Git. Fill in the hash column with:

```bash
git log --oneline --reverse
```

| Entry | Commit message | Hash |
|---|---|---|
| 1 | `chore: initialize LedgerLine project and backend` | |
| 2 | `feat: configure PostgreSQL database and Prisma schema` | |
| 3 | `feat: implement JWT authentication and user registration` | |
| 4 | `feat: implement role-based authorization and account permissions` | |
| 5 | `feat: implement secure account management APIs` | |
| 6 | `feat: implement deposit withdrawal and transfer APIs` | |
| 7 | `feat: initialize React frontend with Tailwind CSS` | |
| 8 | `feat: implement login and registration pages` | |
| 9 | `feat: implement role-based dashboards` | |
| 10 | `feat: implement deposit withdrawal and transfer interfaces` | |
| 11 | `feat: integrate React frontend with backend APIs` | |
| 12 | `feat: implement idempotent financial transactions` | |
| 13 | `feat: strengthen concurrency control and ledger integrity` | |
| 14 | `test: verify financial transactions and application integration` | |
| 15 | `test: add authentication and account management tests` | |
| 15 | `test: add financial transaction integrity tests` | |
| 16 | `test: verify idempotency and duplicate transaction prevention` | |
| 17 | `test: verify concurrent transaction safety` | |
| 18 | `security: strengthen authentication and financial access controls` | |
| 19 | `docs: add financial security threat model` | |
| 20, 21 | `docs: complete README and API documentation` | |
| 22 | `chore: finalize deployment configuration` | |
| 23 | `feat: add secure first-admin bootstrap and password change` | |
| 24 | `security: run the API as a limited database role` | |
| 25 | `feat: add Redis rate limiting, account lockout and readiness checks` | |
| 26 | `feat: add customer onboarding with automatic approval` | |
| 27 | `fix: create demo transactions only once and make production demo seeding opt-in` | |
| 28 | `feat: add admin dashboard, user management and staff management` | |
| 29 | `feat: add tamper-evident audit trail and security event logging` | |
