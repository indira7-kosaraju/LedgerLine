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
