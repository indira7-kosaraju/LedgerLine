# LedgerLine – Money Movement with a Ledger You Can Prove

A simulated banking app where every deposit, withdrawal and transfer is a balanced double-entry ledger record, safe against duplicate
requests and simultaneous requests, and checkable at any time.

## The problem

Moving money is not just "change a number in a table". A real money system must make sure that:

- a retried or double-clicked request does not send the money twice,
- two requests at the same moment cannot spend the same balance twice,
- every balance can be explained by an append-only history that nobody can quietly edit,
- each user can only see and move their own money, and staff roles can only do their own job.

LedgerLine is a learning project that implements these guarantees end to end and tests them, with simulated money only.

## What I built

- **React frontend** (React 19, Vite, Tailwind): login and registration, role-based dashboards, deposit / withdrawal / transfer forms,
  transaction history and details, and admin and auditor views.
- **Node.js backend** (Express 5) with **PostgreSQL 17** through **Prisma**, plus 4 committed migrations.
- **Double-entry ledger:** every transaction writes a DEBIT and a CREDIT of the same amount. Deposits and withdrawals go through a
  SYSTEM account, so the sum of all balances is always ₹0. Money is stored as whole paise (BigInt), never as floating point.
- **Database-enforced integrity:** triggers make `ledger_entries`, `transactions` and `audit_logs` append-only (UPDATE, DELETE and
  TRUNCATE are blocked), chain the entries in order, and check at commit that each transaction balances and each stored balance matches
  its ledger.
- **Idempotency:** each money request needs an `Idempotency-Key`. A retry with the same key returns the original result
  (`Idempotent-Replayed: true`). The same key with a different body is refused with `422 IDEMPOTENCY_KEY_REUSED`. The key is saved in
  the same database transaction as the money movement.
- **Concurrency control:** row locks (`SELECT … FOR UPDATE` in a fixed order), then the balance rules checked on the locked rows, with
  automatic retry on deadlock or serialization errors.
- **Authentication and roles:** bcrypt passwords, JWTs in an HttpOnly `SameSite=Strict` cookie, CSRF header check, and session
  revocation on logout and when an account is deactivated. Roles are ACCOUNT_HOLDER, ADMIN and AUDITOR. A user can only use their own
  accounts, an admin cannot move money, and an auditor is read-only.
- **First-admin bootstrap:** `npm run admin:bootstrap` creates the first admin only if no active admin exists (hidden password
  prompt, database lock, audited), and can switch off the public demo admin. Every user can change their own password.
- **Audit log** for logins, account changes, money movements and refusals.
- **Rate limiting** for login, registration and the whole API, plus `TRUST_PROXY` support so limits use the real client IP behind
  hosting proxies.
- **Tests:**
  - 281 backend tests (Jest + Supertest) on a separate test database
  - 24 browser tests (Playwright)
  - 13 frontend unit tests
  - a 56-check smoke test
  - a 13-check database verifier
  - a 25-check deployment verifier
- **Documentation:** [README](../README.md), [API reference](API.md), [threat model](../THREATS.md), [security audit](SECURITY_AUDIT.md),
  [deployment guide](DEPLOYMENT.md), and an [AI prompt log](../PROMPTS.md) with 22 entries.
- **Deployment setup:** frontend on Vercel (`/api/*` rewritten to the backend so the session cookie stays on the same site), backend on
  Render (`render.yaml`), and database on Neon.

## How to run it

Requires Node.js 22 and PostgreSQL 17.

```bash
# Backend
cd backend
cp .env.example .env            # fill in DATABASE_URL and JWT_SECRET (never commit .env)
npm install
npm run db:deploy               # apply all migrations
npm run db:seed                 # SYSTEM account (+ admin/auditor from your .env)
npm run db:seed:demo            # optional: demo users and demo transactions
npm run dev                     # http://localhost:4000

# Frontend (second terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                     # http://localhost:5173
```

Demo login (dummy credentials, simulated money): `asha.holder@example.com` / `DemoPass123`.
More demo users and roles are listed in the README.

Check everything:

```bash
cd backend && npm test && npm run verify:db
cd frontend && npm run test:e2e
```

## AI tools I used

- **Claude Code (Anthropic) in VS Code:**
  - code generation for the backend, frontend, tests and scripts
  - code and security review
  - debugging
  - documentation
  - deployment configuration

  Every AI change was reviewed and tested. Git commits were made by me, by hand, from my own account. The full prompt history is in
  [PROMPTS.md](../PROMPTS.md).

## What the AI got wrong, and what I fixed myself

These are real cases recorded in PROMPTS.md. Each was found by a test, a review or a live request, not assumed.

1. **Ownership check bug.** The AI's first check was `account.ownerId === user.id`. If both values were `undefined`, JavaScript
   evaluates `undefined === undefined` as `true`, so a malformed user would "own" a malformed account. A unit test for this edge case
   caught it. Ownership now requires `user.id` to be a non-empty string.
2. **Debug information leak.** A 500 error response included internal file paths and code because `NODE_ENV` was not set. It now
   defaults to `production`.
3. **Race condition in the account limit.** The code counted accounts and then inserted one, as two separate steps. A test with 10
   simultaneous "open account" requests created 7 accounts, although the limit is 5. Fixed by counting inside a transaction that locks
   the user row.
4. **Tests touching the real database.** The browser-test backend silently loaded the development `.env` instead of `.env.test`. Now
   the test server refuses any database not named `ledgerline_test`.
5. **Security review findings in the AI's own earlier code:**
   - A copied token still worked after logout. Fixed with a session version in every token.
   - The parser accepted `Bearer <token> <token>`. Fixed with strict parsing.
   - A search for `%` matched every row (LIKE wildcard injection). Fixed by escaping.
   - Without `trust proxy`, all users behind the hosting proxy would share one rate-limit bucket.

   Each fix has a test, and undoing the fix makes that test fail (mutation testing).
6. **Facts written from memory.** The AI wrote two example values in the API docs that did not match the real responses. Its demo
   seed's "insufficient funds" example was actually refused for a different reason (`AMOUNT_EXCEEDS_LIMIT`). Both were corrected from
   captured output.
7. **A project rule broken.** I had told the AI not to run any Git commands, and it ran a read-only `git check-ignore`. It was reported
   and recorded, and `.gitignore` is now checked by reading the file.

The lesson: AI output has to be proven by tests and by the real running system, including the AI's own claims about its work.

## What is not finished

**Verified on the live deployment (2026-11-11):**
- The Render backend is up, and `/api/health` reports the database as `ok`.
- A demo login against the backend returns 200.

**Not verified yet:**
- **The live frontend.** The Vercel URL has not been confirmed, and the 25-check `verify-deployment.js` has not been run against the
  live HTTPS site.
- **Browser testing of the deployed app:**
  - login
  - deposit, withdrawal and transfer
  - history
  - idempotency
  - the concurrency race
- **Accepted limitations** (see THREATS.md):
  - Rate limits are kept in memory, per IP. There is no per-account lockout and no MFA.
  - The app's database role owns its tables, so a database owner could disable the ledger triggers. A real system would run the API
    with a role that has fewer privileges.
  - Render's free plan sleeps when idle, so the first request after a pause is slow.
- There is no independent penetration test.

LedgerLine is a learning and demonstration project. It uses simulated money and dummy data only, and is not a production financial
service.
