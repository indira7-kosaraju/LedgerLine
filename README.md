# LedgerLine – Money Movement with a Ledger You Can Prove

A backend for moving simulated money between accounts using a double-entry ledger.
Every balance must be explainable by the ledger entries behind it.

## Stack

- Backend: Node.js, Express, PostgreSQL, Prisma, JWT, bcrypt, Zod
- Frontend: React 19, Vite, Tailwind CSS 4, React Router, Axios

## Project structure

```
LedgerLine/
  backend/
    src/
      config/        # environment config
      controllers/   # HTTP request handlers
      middleware/    # auth, roles, validation, errors
      routes/        # URL → controller mapping
      services/      # business logic (money movement lives here)
      utils/         # small helpers
    prisma/          # database schema and migrations
    tests/
  frontend/          # Day 2
  README.md
  THREATS.md
  PROMPTS.md
```

## Running the backend

```bash
cd backend
cp .env.example .env    # then edit .env with real values
npm install             # also runs `prisma generate`
npm run db:migrate      # create tables
npm run db:seed         # create SYSTEM account + ADMIN/AUDITOR from .env
npm run dev
```

Health check: `GET http://localhost:4000/api/health`

## Running the frontend

```bash
cd frontend
cp .env.example .env    # VITE_API_BASE_URL=http://localhost:4000/api
npm install
npm run dev             # http://localhost:5173 – the backend must be running too
```

## API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/health | – | Server + DB status |
| POST | /api/auth/register | – | Create ACCOUNT_HOLDER user and sign in (cookie) |
| POST | /api/auth/login | – | Sets HttpOnly `ll_session` cookie; returns `{ user }` (plus `token` if header `X-Auth-Mode: bearer`) |
| POST | /api/auth/logout | – | Clears the session cookie (204) |
| GET | /api/auth/me | Bearer | Current user profile |
| GET | /api/audit-logs | ADMIN, AUDITOR | Audit trail; filters `outcome`, `action`, `actionPrefix`, `actorId`, `entityId`, `page`, `limit` |
| GET | /api/admin/users | ADMIN | List users; filters `role`, `status` (ACTIVE/INACTIVE), `q` (name/email) |
| PATCH | /api/admin/users/:id/status | ADMIN | `{ "isActive": false }` to deactivate |
| POST | /api/accounts | ACCOUNT_HOLDER | Create account (max 5), starts at ₹0 |
| GET | /api/accounts | Any role | Holder: own accounts. Admin/Auditor: all, filters `ownerId`, `status`, `type`. Search `q`. Returns `summary.totalBalance` |
| GET | /api/accounts/:id | Owner, ADMIN, AUDITOR | Account details |
| GET | /api/accounts/:id/balance | Owner, ADMIN, AUDITOR | Current balance |
| PATCH | /api/accounts/:id/status | ADMIN | `{ "status": "FROZEN" \| "ACTIVE" \| "CLOSED", "reason"? }` |

| GET | /api/accounts/:id/statement | Owner, ADMIN, AUDITOR | Ledger entries + credits/debits proof; `page`, `limit`, `from`, `to` |
| POST | /api/transactions/deposit | ACCOUNT_HOLDER (own account) | `{ "accountId", "amountPaise", "description"? }` – max ₹1,00,000 |
| POST | /api/transactions/withdraw | ACCOUNT_HOLDER (own account) | `{ "accountId", "amountPaise", "description"? }` |
| POST | /api/transactions/transfer | ACCOUNT_HOLDER (own source) | `{ "fromAccountId", "toAccountId" \| "toAccountNumber", "amountPaise", "description"? }` |
| GET | /api/transactions | Any role | Holder: own. Admin/Auditor: all. Filters `accountId`, `type`, `q` (reference) |
| GET | /api/transactions/:id | Involved holder, ADMIN, AUDITOR | Transaction + ledger entries (holders: only entries on their own accounts) |
| GET | /api/ledger/entries | ADMIN, AUDITOR | Raw ledger; filters `accountId`, `transactionId` |
| GET | /api/ledger/verify | ADMIN, AUDITOR | Proves balances = ledger and Σ balances = 0 |

**Every deposit, withdrawal and transfer requires an `Idempotency-Key` header** (16–100 chars, e.g. a UUID).
Use one key per operation; re-sending the same key with the same body returns the original result
(`Idempotent-Replayed: true`) without moving money again. Same key + different body → `422 IDEMPOTENCY_KEY_REUSED`.

Amounts are sent as **`amountPaise`** – whole paise, e.g. `500000` = ₹5,000.00.

Money is returned as `{ "paise": "500000", "formatted": "₹5,000.00", "currency": "INR" }`.

## Frontend ↔ backend integration

| Backend endpoint | Frontend function (`frontend/src/api/`) | Used on |
|---|---|---|
| GET /health | `getHealth` (health.api) | Home – system status |
| POST /auth/register, /auth/login, /auth/logout, GET /auth/me | `register`, `login`, `logout`, `getCurrentUser` (auth.api) | Register, Sign in, sidebar, session restore |
| POST /accounts | `createAccount` | Dashboard, Accounts |
| GET /accounts | `listAccounts` | Dashboards, Accounts, money forms, history filter |
| GET /accounts/:id | `getAccount` | Account details |
| GET /accounts/:id/balance | `getBalance` | Account details – Refresh |
| GET /accounts/:id/statement | `getStatement` | Account details – statement |
| PATCH /accounts/:id/status | `updateAccountStatus` | Account details (admin) |
| POST /transactions/deposit, /withdraw, /transfer | `deposit`, `withdraw`, `transfer` (transactions.api) | Deposit / Withdraw / Transfer |
| GET /transactions | `listTransactions` | Dashboards, Transactions |
| GET /transactions/:id | `getTransaction` | Transaction details |
| GET /ledger/entries, /ledger/verify | `listLedgerEntries`, `verifyLedger` (oversight.api) | Ledger, admin/auditor dashboards |
| GET /audit-logs | `listAuditLogs` | Audit logs, dashboards |
| GET /admin/users, PATCH /admin/users/:id/status | `listUsers`, `updateUserStatus` | Users (admin), admin dashboard |

Error handling: every request goes through `api/client.js`, which turns failures into `ApiError { status, code, message }`.
401 → signed out and sent to sign-in (then back to the same page); 403 → "Access denied"; 400 → messages under the fields;
404 → "Not found"; 429 → "try again in N seconds"; 500 / network → "Try again" button; page crashes → error card.

## Authentication modes

- **Browser (React app):** HttpOnly cookie `ll_session`. Requests must include `X-Requested-With: XMLHttpRequest` for POST/PATCH/DELETE (CSRF protection).
- **API tools / tests:** send `X-Auth-Mode: bearer` on login to receive the token, then use `Authorization: Bearer <token>`.

## Roles

| Permission | ADMIN | ACCOUNT_HOLDER | AUDITOR |
|---|:-:|:-:|:-:|
| View own accounts | – | ✅ | – |
| View all accounts | ✅ | – | ✅ |
| Freeze / manage accounts | ✅ | – | – |
| Deposit / withdraw / transfer | – | ✅ (own accounts) | – |
| View all transactions & ledger | ✅ | – | ✅ |
| View audit logs (incl. refused attempts) | ✅ | – | ✅ |
| Manage users | ✅ | – | – |

## Ledger integrity (enforced by PostgreSQL)

| Rule | Enforced by |
|---|---|
| No negative customer balance | `CHECK` constraint |
| Ledger entries, transactions and audit logs can't be changed, deleted or truncated | triggers |
| Each new entry continues its account's running balance | `ledger_entries_check_chain` trigger |
| At commit: every transaction has exactly one matching DEBIT and CREDIT | deferred `transactions_must_balance` trigger |
| At commit: every account balance equals its latest ledger balance | deferred `accounts_balance_matches_ledger` trigger |
| Concurrent movements on the same account are serialized | `SELECT … FOR UPDATE` in sorted id order + deadlock retry |
| A request is never processed twice | `Idempotency-Key` + `UNIQUE(userId, key)` in the same DB transaction |

## Tests

```bash
cd backend
cp .env.test.example .env.test          # once – point it at a separate database
createdb -O ledgerline_app ledgerline_test   # once
npm test                                # Jest: 85 tests – unit, idempotency, concurrency, ledger security
npm run smoke                           # end-to-end against the running dev server
```

## Status

- [x] Task 1 – Project setup
- [x] Task 2 – PostgreSQL + Prisma schema
- [x] Task 3 – Authentication
- [x] Task 4 – Role-based authorization
- [x] Task 5 – Account APIs
- [x] Task 6 – Transaction APIs

Day 2:
- [x] Task 1 – Frontend setup (React, Vite, Tailwind, Router, Axios)
- [x] Task 2 – Login and registration
- [x] Task 3 – Role-based dashboards
- [x] Task 4 – Money movement pages
- [x] Task 5 – Backend integration
- [x] Task 6 – Idempotency
- [x] Task 7 – Concurrency and ledger security
- [ ] Task 8 – Testing and final review

> The system is **not** yet claimed to be secure. Idempotency, concurrency testing
> and adversarial tests are planned for Day 2.
