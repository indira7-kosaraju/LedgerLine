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
