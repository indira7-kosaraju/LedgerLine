# PROMPTS.md – AI Usage Log

Record of prompts given to the AI assistant, what it produced, problems found, and my corrections.

---

## Entry 1 – Task 1: Project Setup

**Date:** 2026-11-06

**Prompt used:**
"LedgerLine – Day 1 Development Master Prompt" (full Day 1 plan), starting with Task 1: project setup,
folder structure, npm packages, Express server, health check, env config, .gitignore.
Plus instructions: AI must not run any Git commands; I commit and push manually.

**AI-generated solution:**
- Created folder structure (`backend/src/{config,controllers,middleware,routes,services,utils}`, `backend/prisma`, `backend/tests`, `frontend`).
- Installed: express 5, dotenv, helmet, cors, express-rate-limit, zod, bcrypt, jsonwebtoken.
- `src/config/env.js` – validates environment variables with Zod at startup.
- `src/app.js` – Express app with Helmet, CORS, 10 KB JSON limit, rate limiting, health route, 404 and error handlers.
- `src/server.js` – starts the server, handles graceful shutdown.
- `GET /api/health` endpoint.
- `.gitignore`, `.env`, `.env.example`, README.md, THREATS.md, this file.

**Problems found (actual observations):**
- npm 11 printed a warning that it skipped bcrypt's install script. Checked: bcrypt 6 still works
  because it ships prebuilt binaries (`bcrypt.hash` ran successfully).
- PostgreSQL (`psql`) is not installed on my Mac yet – needs to be installed in Task 2.
- Prisma was intentionally not installed in Task 1; it will be added in Task 2 together with the schema.

**My corrections:**
- _(fill in after reviewing)_

**Related commit:** `chore: initialize LedgerLine project and backend`

---

## Entry 2 – Task 2: PostgreSQL + Prisma Schema

**Date:** 2026-11-06

**Prompt used:** "yes start task2" (continuing the Day 1 master prompt: configure PostgreSQL, connect Prisma,
create User, Account, Transaction, LedgerEntry, IdempotencyKey, AuditLog with PKs, FKs, unique constraints,
indexes, timestamps; money in integer paise).

**AI-generated solution:**
- Installed PostgreSQL 17 via Homebrew, started it as a service.
- Created a dedicated DB role `ledgerline_app` (not superuser) and database `ledgerline`.
- Installed Prisma 6.19.3 (CLI + client), pinned exact versions.
- `prisma/schema.prisma` with 6 models + enums. Money is `BigInt` (paise).
- Double-entry design: every transaction has exactly one DEBIT and one CREDIT ledger entry.
  Deposits/withdrawals use a SYSTEM account (`LL-SYSTEM-EXTERNAL`) so the books always balance.
- Hand-written SQL added to the migration: CHECK constraints (no negative customer balance,
  positive amounts, from ≠ to, INR only, owner rules) and append-only triggers on `ledger_entries` and `audit_logs`.
- `src/config/prisma.js` (shared client), `DATABASE_URL` validation in env.js, DB check in `/api/health`,
  server refuses to start if DB is unreachable, `prisma/seed.js` for the SYSTEM account.

**Problems found (actual observations):**
- `npm view prisma dist-tags` showed `latest` = 8.0.0-rc.31 (a release candidate) and Prisma 7 changed client
  generation for plain-JS projects. Chose stable Prisma 6.19.3 instead. Prisma prints an "update available" banner – ignore it.
- npm 11 skipped Prisma's install scripts too, so the client was not auto-generated. Fixed by running
  `prisma generate` and adding `"postinstall": "prisma generate"` to package.json.
- First constraint test script was flawed: psql ran two statements in one transaction, so the failed CHECK
  rolled back the test user and the next test silently inserted nothing. Re-ran the tests separately – all constraints fire.
- My zsh test command failed because a command stored in a variable isn't word-split in zsh; used a shell function instead.

**My corrections:**
- _(fill in after reviewing)_

**Related commit:** `feat: configure PostgreSQL database and Prisma schema`

---

## Entry 3 – Task 3: JWT Authentication

**Date:** 2026-11-06

**Prompt used:** "task 3" (continuing the Day 1 master prompt: registration, login, bcrypt hashing,
JWT generation, JWT middleware, current-user endpoint, validation, error handling).

**AI-generated solution:**
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`.
- Zod schemas with `strictObject` (unknown fields like `role` are rejected), email trimmed + lowercased,
  password rules (8+ chars, upper/lower/digit, max 72 bytes because bcrypt truncates after 72 bytes).
- bcrypt cost 12; registration always creates `ACCOUNT_HOLDER`.
- JWT: HS256 pinned, issuer + audience checked, 1h expiry, user id in `sub`.
- `authenticate` middleware re-loads the user from the DB on each request (role/deactivation take effect immediately).
- Login uses a dummy bcrypt hash for unknown emails so timing doesn't reveal which emails exist; same error message for all failures.
- Login limiter (10 failed attempts / 15 min / IP), register limiter (10 / hour / IP).
- Audit log rows for register/login success and refusal (EMAIL_TAKEN, WRONG_PASSWORD, UNKNOWN_EMAIL, USER_INACTIVE). Passwords never logged.

**Problems found (actual observations):**
- None blocking. Tested 13 cases with curl (valid/duplicate register, `role: ADMIN` injection, weak password,
  wrong password, unknown email, empty body, valid/missing/tampered/wrong-secret/`alg:none` tokens) – all returned the expected status.
- Timing check: wrong-password vs unknown-email both ~0.2 s. Rate limit returned 429 on the 11th failed login.
- Note: rate-limit counters are in memory, so they reset when the server restarts (fine for Day 1; would need Redis in production).
- A test user `asha@example.com` was left in the local DB from these tests.

**My corrections:**
- _(fill in after reviewing)_

**Related commit:** `feat: implement JWT authentication and user registration`

---

## Entry 4 – Task 4: Role-Based Authorization

**Date:** 2026-11-06

**Prompt used:** "task 4" (continuing the Day 1 master prompt: ADMIN / ACCOUNT_HOLDER / AUDITOR roles,
middleware for roles and account ownership, never trust frontend authorization).

**AI-generated solution:**
- `src/config/permissions.js` – one permission matrix; routes ask for permissions, not roles.
  ADMIN and AUDITOR can never move money (separation of duties); AUDITOR is read-only.
- `requirePermission(...)` middleware – 403 + `AUTHZ_DENIED` audit row on refusal.
- `accessControl.service.js` – `canAccessAccount(user, account, action)` (pure, unit-tested) for VIEW / MOVE_MONEY / MANAGE,
  and `assertAccountAccess()` which loads the account, returns 404/403 and audits refusals. Ready for Tasks 5 and 6.
- `requireAccountAccess(action)` route middleware.
- Seed creates ADMIN and AUDITOR from `SEED_*` variables in `.env` (public registration can only create ACCOUNT_HOLDER).
- Endpoints: `GET /api/audit-logs` (ADMIN, AUDITOR; filter `?outcome=REFUSED`), `GET /api/admin/users`,
  `PATCH /api/admin/users/:id/status` (ADMIN; cannot change own status).
- `validate()` extended to query and params (Express 5 `req.query` is read-only, so results go to `req.validatedQuery`).
- 16 unit tests with Node's built-in test runner (`npm test`).

**Problems found (actual observations):**
- **Real bug caught by a unit test:** the first version of the ownership check was `account.ownerId === user.id`.
  With both values `undefined`, JavaScript says `undefined === undefined` is `true`, so a malformed user object would
  "own" a malformed account. Fixed by requiring `user.id` to be a non-empty string. Test now passes (16/16).
- HTTP tests (16 cases) all returned the expected status. Deactivating a user made their existing token fail
  immediately (401), confirming the "reload user on every request" design from Task 3.
- Test user `ravi@example.com` was added to the local DB.

**My corrections:**
- _(fill in after reviewing)_

**Related commit:** `feat: implement role-based authorization and account permissions`

---

## Entry 5 – Task 5: Account Management APIs

**Date:** 2026-11-06

**Prompt used:** "task 5" (continuing the Day 1 master prompt: POST /api/accounts, GET /api/accounts,
GET /api/accounts/:id, GET /api/accounts/:id/balance; unique account numbers, balances, ownership, status codes).

**AI-generated solution:**
- Account numbers `LL` + 10 digits from `crypto.randomInt`; DB unique constraint + retry on collision.
- `POST /api/accounts` (ACCOUNT_HOLDER only): owner = logged-in user, balance always starts at 0, body rejects `balance`/`ownerId`, INR only, max 5 accounts per user.
- `GET /api/accounts`: holders see only their own (ownerId filter ignored); ADMIN/AUDITOR see all with filters.
- `GET /api/accounts/:id` and `/balance`: `requirePermission` + `requireAccountAccess('VIEW')` (403 not owner, 404 missing, 400 bad uuid).
- Extra: `PATCH /api/accounts/:id/status` (ADMIN) to freeze/unfreeze/close, inside a DB transaction with `SELECT ... FOR UPDATE`;
  closed accounts can't reopen; closing requires zero balance; SYSTEM account can't be managed.
- Money sent as `{ paise: "500000", formatted: "₹5,000.00", currency: "INR" }` – paise as string because BigInt can't be JSON-serialized
  and large numbers lose precision as JSON numbers. Global `json replacer` as a safety net.

**Problems found (actual observations):**
- `JSON.stringify` throws on BigInt – handled by explicit serialization plus a global replacer.
- **My own test was wrong, not the code:** the unit test for formatting 2^63−1 paise expected `₹9,22,33,...775.07`,
  but the correct value is `₹92,23,37,20,36,85,47,758.07`. Verified with `Intl.NumberFormat('en-IN')` and fixed the test (now 20/20 pass).
- Known limitation: the 5-account limit is checked with a count before insert, so two simultaneous requests could both pass and
  create a 6th account. Low impact (not money), noted for Day 2 concurrency work.
- 24 HTTP cases tested (create, mass-assignment, USD, admin/auditor create, ownership 403s, SYSTEM 403, 404, bad uuid, freeze/unfreeze, limit) – all as expected.

**My corrections:**
- _(fill in after reviewing)_

**Related commit:** `feat: implement secure account management APIs`

---

## Entry 6 – Task 6: Deposit, Withdrawal and Transfer APIs

**Date:** 2026-11-06

**Prompt used:** "task6" (continuing the Day 1 master prompt: deposit, withdraw, transfer, GET /api/transactions,
GET /api/accounts/:id/statement; positive amounts, no floating point, PostgreSQL transactions, atomic transfers,
no negative balances, backend permission checks, ledger entries, refused attempts audited, full rollback,
money conservation, consistent lock order).

**AI-generated solution:**
- New migration: `ledger_entries.entryNumber` (BIGSERIAL) for strict per-account ordering.
- `transaction.service.js` – one `moveMoney()` used by all three operations, inside one `prisma.$transaction`:
  `SELECT ... FOR UPDATE` on both accounts **in sorted id order** → rule checks on locked rows → BigInt balance updates →
  transaction row → DEBIT + CREDIT ledger entries → SUCCESS audit row (same transaction). Retry on deadlock/serialization errors.
- Deposits come from / withdrawals go to the SYSTEM account, so every transaction is double-entry and total money is conserved.
- Refusals (NOT_OWNER, INSUFFICIENT_FUNDS, ACCOUNT_NOT_ACTIVE, DESTINATION_NOT_FOUND, AMOUNT_EXCEEDS_LIMIT, SAME_ACCOUNT,
  VALIDATION_ERROR) are audited **outside** the rolled-back transaction; unexpected errors are audited as ERROR.
- Policy: max ₹1,00,000 per deposit, ₹5,00,000 per withdrawal/transfer (`src/config/policy.js`).
- Amount input `amountPaise`: integer or digit string → BigInt; rejects 0, negatives, decimals, "1e5".
- Transfer response returns only the sender's balance (never the recipient's).
- `GET /api/transactions`, `GET /api/accounts/:id/statement` (with credits/debits proof), `GET /api/ledger/entries`,
  `GET /api/ledger/verify` (balances = ledger, each txn balanced, running balances, sum of all balances = 0).

**Problems found (actual observations):**
- `prisma migrate dev` refused to run because the AI's shell is non-interactive (even with `--create-only`, due to a warning).
  Generated the migration SQL with `prisma migrate diff` against a temporary shadow DB, reviewed it, applied with `prisma migrate deploy`.
  (In my own VS Code terminal `npm run db:migrate` works normally.)
- Prisma warned that `package.json#prisma` (seed config) is deprecated in Prisma 7 – fine on 6.19.3, revisit if upgrading.
- **Real security issue found during the rollback test:** the 500 response contained a `debug` field with internal file paths
  and code because `NODE_ENV` defaulted to `development` when unset. Changed the default to `production` (secure default);
  local `.env` still sets `development`.
- Tests run: 39-check end-to-end flow (Day 1 scenario ₹5,000 + ₹2,000 − ₹1,000 − ₹500 = ₹5,500; receiver +₹500; all refusal cases),
  concurrency smoke test (20 parallel ₹1,000 withdrawals from ₹5,500 → exactly 5 succeeded, final ₹500; 20 opposite-direction
  transfers → no deadlock), rollback test (forced the CREDIT insert to fail with a temporary trigger → 500, balances/txns/entries
  unchanged), direct SQL tamper attempts (UPDATE/DELETE ledger blocked, negative balance blocked). `/api/ledger/verify` ok after all.
- These are smoke tests, not the formal automated concurrency/adversarial suite (Day 2). Idempotency is not implemented yet.

**My corrections:**
- _(fill in after reviewing)_

**Related commit:** `feat: implement deposit withdrawal and transfer APIs`

---

# DAY 2

## Entry 7 – Day 2 review + Task 1: Frontend setup

**Date:** 2026-11-07

**Prompt used:** "LedgerLine – Day 2 Development Master Prompt" (review Day 1, then Task 1: React + Vite, React Router,
Tailwind CSS, Axios, folder structure, API configuration, environment variables). Git is managed manually by me.

**Day 1 review (AI findings, verified by running checks):**
- Backend unchanged since Day 1; `npm test` 24/24 and `npm run smoke` 45/45 passed before any Day 2 change.
- Gaps found for Day 2: idempotency not implemented (table exists, no logic); no `GET /api/transactions/:id` (needed for a
  transaction details page); auth uses a Bearer token in the JSON response – HttpOnly cookies need backend support (Task 2);
  global rate limit (100 req / 15 min) is too low for a dashboard that makes several calls per page (Task 5);
  tests use Node's built-in runner, while Day 2 asks for Jest + Supertest (Tasks 6–8).

**AI-generated solution (Task 1):**
- Scaffolded with `create-vite@9.3.4 --template react` (Vite 8, React 19.3). Added Tailwind CSS 4.3 via `@tailwindcss/vite`,
  React Router 8.5, Axios 1.21. Removed the Vite demo files.
- `src/config/env.js` reads `VITE_API_BASE_URL` (fails with a clear message if missing) – backend URL is not hard-coded.
- `src/api/client.js` – one Axios instance; every error is converted into an `ApiError { status, code, message, details }`
  (handles HTTP errors, timeouts, network errors, canceled requests).
- Design tokens (brand colours, system fonts, focus outlines) in `src/index.css`; reusable `Button`, `Card`, `Badge`, `Alert`, `Spinner`, `Logo`.
- `PublicLayout`, `HomePage` with a live system-status card (calls `/api/health`), `NotFoundPage`. Vite `strictPort: true` on 5173
  because backend CORS only allows that origin.

**Problems found (actual observations):**
- React Router's latest major is 8.5.1 (needs Node ≥ 22.22; this Mac has Node 26). Verified the declarative
  `BrowserRouter/Routes/Route` API by building successfully.
- oxlint warned `react(set-state-in-effect)` twice: first because the effect called a loader that set `loading` synchronously;
  after splitting it, the rule still flagged the indirect call. Rewrote to set state only inside the promise callbacks and
  re-fetch via a `refreshKey`. Lint now clean.
- CORS check: requests with `Origin: http://localhost:5173` get `Access-Control-Allow-Origin`; an untrusted origin gets no
  CORS header (browser blocks reading the response). Note: opening the app as `http://127.0.0.1:5173` would be blocked – use `localhost`.

**My corrections:**
- _(fill in after reviewing)_

**Related commit:** `feat: initialize React frontend with Tailwind CSS`

---

## Entry 8 – Day 2 Task 2: Login and registration

**Date:** 2026-11-07

**Prompt used:** "task2" (Day 2 master prompt Task 2: login + registration pages, validation, password visibility toggle,
loading states, errors, success notifications, protected routes; prefer HttpOnly cookies if supported, otherwise explain tradeoffs).

**AI-generated solution:**
- **Backend (added, nothing removed):** session JWT now set as an `ll_session` cookie – `HttpOnly`, `SameSite=Strict`,
  `Path=/api`, `Secure` in production, expires with the token. `authenticate` accepts `Authorization: Bearer` (API tools)
  or the cookie (browser). Token is returned in the JSON body only when the client sends `X-Auth-Mode: bearer`, so the
  React app's JavaScript never sees it. New `POST /api/auth/logout` (always succeeds, audited). CORS `credentials: true`
  for the exact frontend origin only. New `csrfProtection` middleware: cookie-authenticated POST/PATCH/DELETE must send
  `X-Requested-With: XMLHttpRequest`, otherwise 403 + audit row.
- **Frontend:** `AuthProvider` (restores session via `GET /auth/me` on load; status loading/authenticated/anonymous),
  `ToastProvider`, `useAuth`/`useToast` hooks, `ProtectedRoute` (with optional `roles`), `GuestRoute` (redirects signed-in
  users; only internal redirect paths allowed), `LoginPage`, `RegisterPage` (live password checklist, confirm password),
  `Input`, `PasswordInput` (show/hide toggle), temporary `DashboardPage`, `ForbiddenPage`, header sign-in/out.
  Axios sends `withCredentials` + `X-Requested-With`; a global 401 listener signs the user out when a session expires.

**Problems found (actual observations):**
- **Bug in my own first draft:** `AuthProvider` called `toast.info()` inside a `setState` updater. React StrictMode runs
  updaters twice in development, so the "session expired" toast would have shown twice. Fixed by tracking status in a ref.
- oxlint's `only-export-components` rule warns when a file exports both a component and a hook, so context, provider and hook
  are split into separate files (`context/AuthContext.js`, `context/AuthProvider.jsx`, `hooks/useAuth.js`).
- The duplicate-email test printed a `prisma:error` stack in the server log even though the error is caught and returned as
  409. Changed Prisma logging to warnings only; unexpected errors are still logged by `errorHandler`.
- Smoke test updated to send `X-Auth-Mode: bearer` and extended with 5 cookie checks → 50/50 pass. Browser-style curl test
  with a cookie jar: register → /me → create account → forged POST blocked (403 CSRF_REJECTED) → logout → /me 401.
- Not yet verified visually in a real browser by the AI (no browser available) – verified by lint, build and HTTP tests.

**My corrections:**
- _(fill in after reviewing)_

**Related commit:** `feat: implement login and registration pages`

---

## Entry 9 – Day 2 Task 3: Role-based dashboards

**Date:** 2026-11-07

**Prompt used:** "task3" (Day 2 master prompt Task 3: separate ADMIN, ACCOUNT_HOLDER and AUDITOR dashboards; never show
information the user isn't authorized to see).

**AI-generated solution:**
- **Backend additions:** `GET /api/accounts` returns `summary.totalBalance` (PostgreSQL `SUM` of customer balances, so React
  never adds money up) and accepts `?q=` search (account number / owner name / email – holders only within their own accounts);
  audit logs accept `?actionPrefix=` (e.g. `TXN_` for refused transaction attempts); ledger entries include `accountNumber`;
  global rate limit configurable via `RATE_LIMIT_MAX` (default 600 / 15 min – dashboards make several calls per page).
- **Frontend:** `AppLayout` (sidebar on desktop, slide-out menu on mobile, Escape closes), role-filtered navigation,
  `/dashboard` renders a different dashboard per role, `/accounts` (holder: cards; admin/auditor: searchable, filterable,
  paginated table with filters in the URL), `/accounts/:id` (balance, ledger proof, statement; admin-only freeze/unfreeze/close
  with confirm dialog + audited reason), `/ledger` and `/audit-logs` (admin + auditor only).
  Reusable `useApi` (loading/error/reload, cancels on unmount), `useQueryParams`, `DataTable`, `Pagination`, `StatCard`,
  `ConfirmDialog` (native `<dialog>`), `LedgerIntegrityCard`, status badges.
- Deposit/withdraw/transfer buttons intentionally left for Task 4 (with their pages) to avoid links to missing pages.

**Problems found (actual observations):**
- oxlint `exhaustive-deps`: (1) `items = data?.items ?? []` created a new array every render, so `useMemo` never cached –
  fixed by memoizing `items`; (2) `useApi` used `fetcher` without listing it – fixed with the "latest ref" pattern.
- Headless Chrome test (playwright-core in a scratch folder, driving the installed Chrome) – 37 checks across all three roles
  plus mobile. Findings:
  - First run reported the sidebar highlighting "Dashboard" on an account page. Investigated: **not a bug** – React Router
    renders the new page ~100 ms after the URL changes (transition) and my test read the sidebar in between. Fixed the test to wait.
  - "Search shows Ravi rows" first passed with 16 rows – the old list was still shown while the search loaded. Tightened the test;
    the real result is 2 rows (only Ravi's accounts).
  - Chrome logs every 4xx as a console error (e.g. the expected 401 from `/auth/me` before sign-in) – not app errors; the test
    now fails only on real JS exceptions and 5xx responses.
- **Real UI bugs found from screenshots and fixed:** "Re-verify" button text wrapped onto two lines (buttons now never wrap);
  the Amount column was cut off in dashboard tables at 1280 px (compact table mode + side-by-side layout only from 1536 px;
  measured at 1024/1280/1440/1600 px); the welcome toast said "Welcome back, LedgerLine." for "LedgerLine Admin" because I
  used the first word of the name – now uses the full name.

**My corrections:**
- _(fill in after reviewing)_

**Related commit:** `feat: implement role-based dashboards`

---

## Entry 10 – Day 2 Task 4: Money movement pages

**Date:** 2026-11-07

**Prompt used:** "task4" (Day 2 master prompt Task 4: Deposit, Withdraw, Transfer, Transaction Details, Transaction History;
validate inputs, confirm before submitting, loading state, success, meaningful errors, refresh balances; never calculate or
approve financial transactions in React).

**AI-generated solution:**
- **Backend additions:** `GET /api/transactions/:id` – admin/auditor see everything; an account holder only if one side is
  their account, and only the ledger entries on their own accounts (the other side's `balanceAfter` would reveal someone
  else's balance); `initiatedBy` hidden from the receiver; uninvolved users get 403 + audit row (`TXN_VIEW / NOT_INVOLVED`).
  `GET /api/transactions?q=` searches by reference.
- **Frontend:** one `MoneyMovementPage` for `/deposit`, `/withdraw`, `/transfer` (account holders only): account select with
  balances, transfer to own account or any account number, amount field with ₹ prefix, review → confirmation dialog →
  receipt with reference and new balance; balances reloaded after every attempt. `/transactions` history (reference search,
  type and account filters, pagination, +/− for holders) and `/transactions/:id` details. Quick actions on the holder
  dashboard and on the owner's account page (preselect the account).
- `utils/money.js` `parseAmount` turns "1,250.50" into "125050" paise by moving the decimal point as text – no floating
  point. Balance, limits, ownership and status are only checked by the backend.
- After a network error / 5xx the form says the transaction "may or may not have gone through" and links to the history,
  instead of inviting a blind retry (idempotency comes in Task 6).

**Problems found (actual observations):**
- Parser checked with 18 inputs ("1,250.5" → 125050, "0.1" → 10, "007" → 700; "-5", "1e5", "10.555", ".5", "0" rejected).
- Browser test (31 checks, fresh user, real forms): Day 1 scenario through the UI gives ₹5,500.00; validation, server
  refusals (insufficient funds, unknown account), cancel sends nothing, **double-click on Confirm creates exactly one
  transaction**, simulated network failure shows the uncertainty warning, privacy on details, auditor sees both entries,
  auditor on /deposit → /forbidden; ledger verify still OK; DB balances A1 ₹5,239.50 / A2 ₹250.50 as expected.
- One test failure was my test again (counted table rows before React rendered the new page) – fixed the wait.
- Wording bug from screenshots: "Withdraw of ₹1,000.00 completed" / "Review withdraw" – added a separate noun ("withdrawal").
- First privacy note said "another customer's account" – wrong for deposits/withdrawals, where the other side is the SYSTEM
  account. Reworded to "an account that isn't yours".

**My corrections:**
- _(fill in after reviewing)_

**Related commit:** `feat: implement deposit withdrawal and transfer interfaces`

---
