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
| GET | /api/audit-logs | ADMIN, AUDITOR | Audit trail; filters `outcome`, `action`, `actorId`, `entityId`, `page`, `limit` |
| GET | /api/admin/users | ADMIN | List users; filter `role` |
| PATCH | /api/admin/users/:id/status | ADMIN | `{ "isActive": false }` to deactivate |
| POST | /api/accounts | ACCOUNT_HOLDER | Create account (max 5), starts at ₹0 |
| GET | /api/accounts | Any role | Holder: own accounts. Admin/Auditor: all, filters `ownerId`, `status`, `type` |
| GET | /api/accounts/:id | Owner, ADMIN, AUDITOR | Account details |
| GET | /api/accounts/:id/balance | Owner, ADMIN, AUDITOR | Current balance |
| PATCH | /api/accounts/:id/status | ADMIN | `{ "status": "FROZEN" \| "ACTIVE" \| "CLOSED", "reason"? }` |

| GET | /api/accounts/:id/statement | Owner, ADMIN, AUDITOR | Ledger entries + credits/debits proof; `page`, `limit`, `from`, `to` |
| POST | /api/transactions/deposit | ACCOUNT_HOLDER (own account) | `{ "accountId", "amountPaise", "description"? }` – max ₹1,00,000 |
| POST | /api/transactions/withdraw | ACCOUNT_HOLDER (own account) | `{ "accountId", "amountPaise", "description"? }` |
| POST | /api/transactions/transfer | ACCOUNT_HOLDER (own source) | `{ "fromAccountId", "toAccountId" \| "toAccountNumber", "amountPaise", "description"? }` |
| GET | /api/transactions | Any role | Holder: own. Admin/Auditor: all. Filters `accountId`, `type` |
| GET | /api/ledger/entries | ADMIN, AUDITOR | Raw ledger; filters `accountId`, `transactionId` |
| GET | /api/ledger/verify | ADMIN, AUDITOR | Proves balances = ledger and Σ balances = 0 |

Amounts are sent as **`amountPaise`** – whole paise, e.g. `500000` = ₹5,000.00.

Money is returned as `{ "paise": "500000", "formatted": "₹5,000.00", "currency": "INR" }`.

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

Run unit tests: `npm test`

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
- [ ] Task 3 – Role-based dashboards
- [ ] Task 4 – Money movement pages
- [ ] Task 5 – Backend integration
- [ ] Task 6 – Idempotency
- [ ] Task 7 – Concurrency and ledger security
- [ ] Task 8 – Testing and final review

> The system is **not** yet claimed to be secure. Idempotency, concurrency testing
> and adversarial tests are planned for Day 2.
