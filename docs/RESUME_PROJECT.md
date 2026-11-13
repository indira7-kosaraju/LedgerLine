# LedgerLine — Resume & Portfolio Descriptions

Every statement below is backed by the code or the project's recorded verification (see [README.md](../README.md),
[DEPLOYMENT.md](DEPLOYMENT.md)). LedgerLine moves **simulated money only** — do not describe it as processing real payments or
having production users.

---

## 1. Project title

**LedgerLine — Secure Simulated Banking & Double-Entry Ledger Platform**

## 2. Technology stack

React 19 · React Router · Vite · Tailwind CSS · Node.js · Express 5 · PostgreSQL · Prisma ORM · Redis · Zod · JWT · bcrypt ·
Jest · Supertest · Playwright · Vercel · Render · Neon

## 3. Links

- Live demo: <https://ledger-line-umber.vercel.app/>
- Source code: <https://github.com/indira7-kosaraju/Nilcent>

## 4. Resume bullet points

- Built a full-stack simulated banking platform (React, Express, PostgreSQL/Prisma) in which every deposit, withdrawal and transfer is a
  double-entry ledger transaction, with balance conservation, append-only history and running balances enforced by PostgreSQL
  constraints and triggers.
- Implemented idempotent, concurrency-safe money movement (idempotency keys claimed inside the database transaction, row-level locking
  in a fixed order, deadlock retry), plus role-based access for customers, administrators and auditors, Redis-backed rate limiting with
  account lockout, and a SHA-256 hash-chained, tamper-evident audit log.
- Deployed on Vercel, Render and Neon with a least-privilege database role and readiness checks; verified with 436 backend tests,
  35 Playwright browser tests, mutation tests of key safeguards, and recorded production checks (17/17 database, 29/29 live).

## 5. Two-line version

Full-stack simulated banking platform (React, Express, PostgreSQL, Redis) with a database-enforced double-entry ledger, idempotent and
concurrency-safe transfers, role-based admin/auditor tools and a tamper-evident audit trail; deployed on Vercel/Render/Neon with 436 backend tests.

## 6. LinkedIn / portfolio version

**LedgerLine** is a full-stack banking simulation I built to explore how money systems stay correct. Customers open accounts and
deposit, withdraw and transfer simulated rupees; administrators manage users, staff and accounts; auditors verify everything read-only.

Each movement is a double-entry ledger transaction, and the critical rules — balances never negative, every transaction balanced, history
never edited — are enforced by PostgreSQL triggers and constraints, not just application code. Retries can't pay twice (idempotency
keys inside the database transaction), simultaneous withdrawals can't overdraw (row-level locks), and the audit log is SHA-256
hash-chained so any change to past records is detected. Sign-in is protected by Redis rate limiting and account lockout, and the API runs
as a database role that cannot change the schema.

The app is deployed on Vercel (React, Black & Gold UI), Render (Express API) and Neon (PostgreSQL), and is verified by 436 backend tests,
35 browser tests and recorded production checks.

## 7. 30-second interview explanation

"LedgerLine is a simulated banking app where I focused on financial correctness. Every transfer is recorded as a debit and a credit, so
all balances always add up to zero, and PostgreSQL itself refuses anything that would break that — a negative balance, an unbalanced
transaction or an edited history row. I handled the classic failures: a retried request can't pay twice because of idempotency keys,
and two withdrawals at the same moment can't overdraw because of row locking — I proved that with concurrency tests. It has separate
customer, admin and auditor roles, a hash-chained audit log, Redis rate limiting, and it's deployed on Vercel, Render and Neon with
436 backend tests and live production checks."
