# LedgerLine – Money Movement with a Ledger You Can Prove

A backend for moving simulated money between accounts using a double-entry ledger.
Every balance must be explainable by the ledger entries behind it.

## Stack

- Backend: Node.js, Express, PostgreSQL, Prisma, JWT, bcrypt, Zod
- Frontend (Day 2): React, Tailwind CSS

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
npm run db:seed         # create the SYSTEM account
npm run dev
```

Health check: `GET http://localhost:4000/api/health`

## API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/health | – | Server + DB status |
| POST | /api/auth/register | – | Create ACCOUNT_HOLDER user, returns token |
| POST | /api/auth/login | – | Returns token |
| GET | /api/auth/me | Bearer | Current user profile |

## Status

- [x] Task 1 – Project setup
- [x] Task 2 – PostgreSQL + Prisma schema
- [x] Task 3 – Authentication
- [ ] Task 4 – Role-based authorization
- [ ] Task 5 – Account APIs
- [ ] Task 6 – Transaction APIs

> The system is **not** yet claimed to be secure. Idempotency, concurrency testing
> and adversarial tests are planned for Day 2.
