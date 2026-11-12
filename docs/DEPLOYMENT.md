# Deploying LedgerLine

**Target:** frontend on **Vercel**, backend on **Render**, database on **Neon** (managed PostgreSQL). All three have free plans.
Simulated money only – never use real banking data.

**Current deployment (verified 2026-11-12):** frontend <https://ledger-line-umber.vercel.app> · backend
<https://ledgerline-z5o2.onrender.com> · Neon PostgreSQL 18. The API connects as `ledgerline_api`; `verify-db` passed 14/14 and
`verify-deployment` 25/25 (see "Production verification" at the end).
Step 3 (Redis rate limits + readiness) is deployed and verified (see "Production verification – step 3" at the end).
**Step 4 (onboarding) is implemented and tested locally but not deployed yet** – it needs the database migration first (see "Deploying a
migration" below).

```
Browser ──https──▶ <app>.vercel.app ──┬─ /, /dashboard, …  → React app (static files on Vercel)
                                      └─ /api/*  ── rewrite ──▶ <api>.onrender.com/api/* ──▶ Neon PostgreSQL
```

**Why the `/api` rewrite?** `*.vercel.app` and `*.onrender.com` are different sites. Browsers don't send a `SameSite=Strict` cookie
from one to the other (Safari blocks such cookies completely). With the rewrite the browser only talks to the Vercel site, so the
HttpOnly session cookie, CSRF protection and CORS all work unchanged.

| File | Purpose |
|---|---|
| `render.yaml` | Render Blueprint: build `npm ci --include=dev`, start `npm start`, health check `/api/health/ready`, env vars |
| `frontend/vercel.json` | `/api/*` rewrite to Render, SPA fallback, security headers (CSP, HSTS, X-Frame-Options, …) |
| `backend/scripts/prepare-production-db.js` | `npm run db:prepare:production` – migrations, roles, system seed, verification on the production DB (demo data only with `-- --with-demo`) |
| `backend/scripts/verify-deployment.js` | `npm run verify:deployment -- <url>` – 25 end-to-end checks against the live site |

---

## Step 1 – Database (Neon)

1. Go to <https://neon.tech> → **Sign up** (e.g. with GitHub).
2. **Create project:** name `ledgerline`, Postgres version **17**, region **AWS Asia Pacific (Singapore)** (same region as the Render service).
3. On the project dashboard click **Connect** and keep the default database (`neondb`) and role (`neondb_owner`). Copy the string
   **with "Connection pooling" switched off** – this is the *direct* owner connection (host without `-pooler`):
   `postgresql://neondb_owner:••••@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
4. Generate a password for the API role on your Mac (letters and digits only, 40 characters):
   `openssl rand -base64 48 | tr -dc A-Za-z0-9 | head -c 40; echo`
5. Create **`backend/.env.production`** (ignored by Git) with two lines – the API role on the **pooled** host (same host with
   `-pooler` after the endpoint id), and the owner on the direct host:
   ```
   DATABASE_URL="postgresql://ledgerline_api:<generated-password>@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connection_limit=5"
   DIRECT_DATABASE_URL="<the direct owner string from step 3>"
   ```
   ⚠️ Never paste these strings into chat, an issue, a commit or a screenshot – they contain database passwords.
6. Prepare the database:
   ```bash
   cd ~/Documents/snovasys/LedgerLine/backend
   npm run db:prepare:production -- --with-demo     # first time: also creates the demo users and demo transactions
   ```
   Expected: all migrations applied, `ledgerline_api has exactly the planned privileges`, `SYSTEM account ready`, `Skipping ADMIN/AUDITOR`
   (private accounts are not copied to production), 7 demo steps (no demo admin), and `✅ Database state verified: 15 checks passed`.
   Later runs (e.g. for a new migration) without `--with-demo` leave demo data alone; even with it, demo transactions are created only
   once (skipped as soon as a demo holder has any transaction).

7. Create your **real first admin** (and switch off the public demo admin if an older deployment created one):
   ```bash
   npm run admin:bootstrap -- --production --email you@example.org --name "Your Name" --replace-demo-admin
   ```
   Type the password at the hidden prompt (twice). Expected: `✅ First admin created: …`.

## Step 2 – Redis and backend (Render)

The server keeps rate-limit counters in Redis and **refuses to start in production without it**. Create Redis first:

1. Render → **New → Key Value** (Render's Redis-compatible store): name `ledgerline-redis`, the **same region** as the API
   (Singapore), plan **Free**, maxmemory policy **noeviction** (counters must never be evicted early).
   Leave the external access list empty – then it is reachable only from your Render services, not from the internet.
2. Open it and copy the **Internal** connection URL (`redis://red-…:6379`). Treat it as a secret.

Then the backend:

1. Go to <https://render.com> → **Sign up with GitHub** and allow access to the LedgerLine repository.
2. **New → Blueprint** → select the repository. Render reads `render.yaml` and shows the service `ledgerline-api`.
3. Fill in the secret values when asked:
   - `DATABASE_URL` – the **`ledgerline_api`** string (`DATABASE_URL` from step 1.5). Never the owner string.
   - `REDIS_URL` – the internal Key Value URL from above.
   - `CORS_ORIGIN` – the URL your frontend **will** have, e.g. `https://<your-app>.vercel.app`
     (if you don't know it yet, enter a guess and correct it in step 4). This deployment uses `https://ledger-line-umber.vercel.app`.
   `JWT_SECRET` is generated by Render automatically – you never see or type it.
4. Click **Apply**. The first build takes a few minutes. Wait until the service shows **Live**.
5. Open `https://<your-service>.onrender.com/api/health/ready` – expected `{"status":"ready","checks":{"database":"ok","redis":"ok","schema":"ok","dbRole":"ok"},…}`.
   Render uses this as its health check: a deploy whose readiness fails never goes live, and the previous version keeps running.
6. Copy the service host name (e.g. `ledgerline-api-abcd.onrender.com`).

## Step 3 – Point the frontend at the backend

In `frontend/vercel.json`, replace `REPLACE-WITH-RENDER-HOST.onrender.com` with your host name from step 2.6, then commit and push:

```bash
cd ~/Documents/snovasys/LedgerLine
git add frontend/vercel.json
git commit -m "chore: point Vercel /api rewrite to the Render backend"
git push
```

## Step 4 – Frontend (Vercel)

1. Go to <https://vercel.com> → **Sign up with GitHub**.
2. **Add New → Project** → import the LedgerLine repository.
3. Settings:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (detected automatically) – build `npm run build`, output `dist`
   - **Environment Variable:** `VITE_API_BASE_URL` = `/api`
4. Click **Deploy** and wait for the URL (Vercel picks it, e.g. `https://ledger-line-umber.vercel.app` for this deployment).
5. If the URL differs from what you entered as `CORS_ORIGIN` in step 2: Render → `ledgerline-api` → **Environment** → set
   `CORS_ORIGIN` to the exact URL (no trailing slash) → **Save** (Render redeploys).

## Step 5 – Verify the live deployment

```bash
cd ~/Documents/snovasys/LedgerLine/backend
npm run verify:deployment -- https://<your-app>.vercel.app
```

Expected: `✅ Deployment verified: 25 checks passed` – site and security headers, SPA deep links, health through the rewrite, the demo
holder and auditor logins, a Secure HttpOnly cookie, role checks, deposit / withdrawal / transfer / history, idempotency (replay, 5 simultaneous
duplicates, reused key → 422), the ₹800 + ₹700 race on ₹1,000, a balanced ledger, and that the public demo admin **cannot** log in.

Then try it in a browser with the demo credentials (README → Demo credentials).

## Notes and known limitations

- **Cold starts:** Render's free plan sleeps after about 15 minutes without traffic; the first request then takes up to a minute while it
  wakes. That first request through the Vercel rewrite may time out – open `https://<your-service>.onrender.com/api/health` first,
  wait for `ok`, then use the app.
- **Migrations do not run on Render.** The server only has the limited API role. Run `npm run db:prepare:production` from your computer
  **before** pushing code that contains a new migration.
- **`TRUST_PROXY=2`** (Vercel + Render) makes rate limits use the real client IP for traffic through the app. Requests sent **directly**
  to the `onrender.com` URL could fake one `X-Forwarded-For` entry and so get around the per-IP rate limit (accepted risk, see THREATS.md).
- **Database roles:** the API uses `ledgerline_api` (rows only; see "Separate database roles" below). Keep the owner connection
  (`DIRECT_DATABASE_URL`) only in `backend/.env.production` on your computer – never on Render.
- **Demo data is public:** anyone can log in with the demo credentials. `npm run db:prepare:production` can be re-run at any time; it
  only touches demo data with `--with-demo`, and then creates demo transactions only if the demo holders have none yet (fixed after the
  duplicate on 2026-11-12 – see "Accepted: 7 duplicated demo transactions").

## Rate limits and readiness (Redis)

| Limit | Default | Fails when Redis is down |
|---|---|---|
| Whole API, per IP | 600 / 15 min (`RATE_LIMIT_MAX`) | **open** – requests continue, error logged |
| Failed logins, per IP | 10 / 15 min (`AUTH_LOGIN_FAILURE_LIMIT`) | **closed** – `503 SERVICE_UNAVAILABLE` |
| Failed logins, per account (any IP) | 10 / 15 min (`AUTH_ACCOUNT_FAILURE_LIMIT`) | **closed** |
| Registrations, per IP | 10 / hour (`AUTH_REGISTER_LIMIT`) | **closed** |

- Keys are prefixed per environment (`REDIS_KEY_PREFIX`, production `ll:prod:`); accounts appear only as a SHA-256 hash.
- `/api/health/live` – the process runs. `/api/health/ready` – database, Redis, ledger triggers/constraints and the limited role.
  Neither is rate limited; readiness results are reused for 2 seconds.
- If Redis is down after a deploy, readiness turns red, Render's health check fails and a **new** deploy does not go live.

## Separate database roles (Neon)

| Variable | Role | Neon host | Used by | Where it lives |
|---|---|---|---|---|
| `DATABASE_URL` | `ledgerline_api` (rows only) | **pooled** (`…-pooler…`), with `&pgbouncer=true&connection_limit=5` | the API, seeds, `admin:bootstrap` | Render **and** `.env.production` |
| `DIRECT_DATABASE_URL` | `neondb_owner` (owns the tables) | **direct** (no `-pooler`) | `prisma migrate deploy`, `npm run db:roles` | **only** `.env.production` on your computer |

- `npm run db:roles -- --production` creates `ledgerline_api` with the password from `DATABASE_URL` and grants
  exactly the privileges in `backend/scripts/setup-db-roles.js`. **Do not create the role in the Neon console** – console roles become
  members of `neon_superuser`, and the script refuses such a role.
- The password: Neon only accepts a **plain-text** password in `CREATE ROLE` / `ALTER ROLE` (a pre-hashed one is rejected with
  "Neon only supports being given plaintext passwords"). For `*.neon.tech` hosts the script therefore sends it over TLS (it refuses
  an owner URL without `sslmode=require`) and Neon stores a SCRAM hash; other servers receive a SCRAM hash computed on your computer.
  The script never prints the password or a connection string, including in error messages.
- `pgbouncer=true`: Neon's pooler is PgBouncer – Prisma must not use prepared statements through it. `connection_limit=5` keeps the
  small free-plan server from opening a large pool (the role itself is capped at 50 connections).
- `npm run db:prepare:production` checks all of this (different roles, direct owner host, `pgbouncer=true`) and refuses otherwise.

## Production verification – step 2 (2026-11-12)

Run after switching Render's `DATABASE_URL` to `ledgerline_api`. Database checks were read-only; the live checks create a test user.

| Check | Result |
|---|---|
| `GET /api/health` (directly and through the Vercel `/api` rewrite) | ✅ 200, database `ok` |
| Readiness endpoint | ⏭️ not deployed at the time – built in step 3 (see the note at the top) |
| App connections on Neon (`pg_stat_activity`, read-only) | ✅ only `ledgerline_api` (via pgbouncer), no `neondb_owner` |
| `verify-db` as `ledgerline_api` | ✅ 14/14, before and after the live run |
| Demo admin `demo.admin@example.com` | ✅ disabled; the bootstrapped admin is the only active admin |
| Frontend https://ledger-line-umber.vercel.app | ✅ HTTPS, CSP/HSTS/nosniff/X-Frame-Options, SPA deep link, http→https 308, 401 without login |
| `npm run verify:deployment -- https://ledger-line-umber.vercel.app` | ✅ 25/25 |

The live run permanently added one `deploy-check-…@example.com` user, 3 accounts and 6 transactions (simulated money; the ledger and
audit log are append-only, so they stay).

## Production verification – step 3 (2026-11-12)

Commit `7c324eb` (Redis rate limits + readiness), with a Render Key Value instance (`ledgerline-redis`, Free, Singapore, `noeviction`,
internal access only) and `REDIS_URL` set on the API. Health, readiness and database checks were read-only; only the 25 live checks
created data.

| Check | Result |
|---|---|
| `GET /api/health` · `/api/health/live` | ✅ 200 · ✅ 200 `alive` |
| `GET /api/health/ready` (directly and through Vercel) | ✅ 200 – `database`, `redis`, `schema`, `dbRole` all `ok`; `Cache-Control: no-store` |
| Health checks not rate limited | ✅ 20 of 20 quick readiness requests → 200, no `RateLimit` headers |
| App connections on Neon | ✅ only `ledgerline_api` (3, via pgbouncer) |
| General limit configuration | ✅ `RateLimit-Policy: "600-in-15min"`; for one client key the remaining count fell 595 → 594 → 593 across requests (stored in Redis) |
| Login / account / registration limits | ⏭️ deliberately not triggered on production (would lock accounts and add audit records) – covered by the backend tests |
| Frontend | ✅ HTTPS, CSP/HSTS/nosniff/X-Frame-Options, SPA deep link, http→https 308 |
| `verify-db` as `ledgerline_api` | ✅ 14/14, before and after the live run (27 transactions, 54 entries afterwards) |
| `npm run verify:deployment -- https://ledger-line-umber.vercel.app` | ✅ 25/25 – logins and registration now run through the Redis-backed limiters |
| Demo admin / bootstrapped admin | ✅ demo admin disabled; exactly one other active admin |

Observation: requests from one computer were counted under up to three client keys (one for IPv6, two for IPv4). That fits a network
with several public addresses; IPv6 requests always got the same key, directly and through Vercel. Not confirmed with an outside
IP service. The live run permanently added one more `deploy-check-…` user, 3 accounts and 6 transactions.

## Deploying a migration (step 4 and later)

The server never migrates (it only has the limited role). For a release that contains a migration:

1. From your computer: `cd backend && npm run db:prepare:production` (no `--with-demo`) – applies the migration as the owner, re-runs
   `db:roles` (new tables get their privileges; an unlisted table stops the script), the system seed, and `verify-db`.
2. Then push. Until step 1 has run, the new version's readiness check reports `schema: failed` (its triggers are missing), so Render
   does not switch to it and the previous version keeps serving.

Step 4's migration (`20261112120000_customer_onboarding`) only adds things: two enums, four columns on `users`, the
`customer_profiles` table, CHECK constraints and two triggers. Existing users are marked `APPROVED`; no data is changed or deleted.
After it: `verify-db` has 15 checks and `verify-deployment` 27.

**Short window between migration and deploy:** the previous version keeps serving until the new one is live. During that time a user
who registers *after* the migration starts at `PENDING_PROFILE`, the old frontend has no onboarding page, and opening an account fails
with a generic 500 (the new trigger refuses it). Existing users are not affected. Keep the window short: migrate, then push at once.

## Step 4 migration on production (S1, 2026-11-12)

Before S1: a Neon branch `pre-step4` was created from production as a restore point, the migration was rehearsed on a copy of the
development database (all data fingerprints identical before/after; a deliberately broken copy left nothing behind), and a snapshot of
production was saved (counts and fingerprints of users, accounts, transactions, ledger entries, audit records, idempotency keys).

`npm run db:prepare:production` then applied `20261112120000_customer_onboarding`, set the `customer_profiles` privileges
(`SELECT, INSERT`) and passed `verify-db` 15/15. Compared with the snapshot:

| Data | Result |
|---|---|
| Users (8 – email, role, active flag, password hash, session version) | identical; all `APPROVED` |
| Accounts (13) | same accounts; balances changed only on the demo accounts below |
| The 27 transactions, 54 ledger entries and 105 audit records that existed before | identical |
| Idempotency keys | 33 → 33 |
| New objects | both triggers enabled, 3 CHECK constraints, `customer_profiles` (owner `neondb_owner`, 0 rows) |

### Accepted: 7 duplicated demo transactions (simulated money)

S1 also re-ran the demo seed, which was assumed to "replay instead of duplicating". That is only true for 24 hours: idempotency keys
expire after 24 hours, the demo seed had first run on production earlier than that, so its fixed keys were treated as expired and
the 7 demo operations ran **again** (stored times 12:16:08–12:16:22 UTC):

| # | Type | Amount | Description | Initiated by | From → to |
|---|---|---|---|---|---|
| 1 | Deposit | ₹5,000 | Salary | asha.holder@example.com | SYSTEM → Asha main |
| 2 | Deposit | ₹2,000 | Bonus | asha.holder@example.com | SYSTEM → Asha main |
| 3 | Withdrawal | ₹1,000 | Cash | asha.holder@example.com | Asha main → SYSTEM |
| 4 | Transfer | ₹500 | Dinner | asha.holder@example.com | Asha main → Ravi |
| 5 | Transfer | ₹1,500 | Savings | asha.holder@example.com | Asha main → Asha savings |
| 6 | Deposit | ₹1,200 | Opening deposit | ravi.holder@example.com | SYSTEM → Ravi |
| 7 | Withdrawal | ₹3,000 | More than the balance | ravi.holder@example.com | Ravi → SYSTEM |

No. 7 had been **refused** the first time (insufficient funds, by design – a demo of a refused attempt); this time Ravi's balance was
high enough because of no. 6 and no. 4, so it succeeded. Result: 34 transactions, 68 ledger entries; Asha ₹8,000 + ₹3,000, Ravi ₹400,
SYSTEM −₹21,770; all balances still sum to ₹0 and every ledger check passes. Only the two demo holders and the SYSTEM account are
affected – no real user, the bootstrapped admin, or any account outside the demo.

**Decision (2026-11-12):** accepted as they are. The ledger is append-only, so they are **not deleted**, and they are **not reversed**
(that would add more records).

**Fix (2026-11-12, local scripts only – nothing to deploy on Render):**
- `prisma/seed-demo.js` creates the demo transactions only if **neither demo holder has any transaction yet** – it no longer relies
  on idempotency keys, which expire after 24 hours. A re-run prints `Demo transactions: skipped – the demo holders already have N
  transaction(s)`. This also protects demo holders that visitors have used through the public demo login.
- `npm run db:prepare:production` no longer runs the demo seed; only `npm run db:prepare:production -- --with-demo` does. Unknown
  options are refused (a typo such as `--with-demos` stops the script before it connects anywhere).
- Regression tests (`backend/tests/integration/seedDemo.test.js`): a re-run immediately, after the keys **expired** (the production
  bug), after the keys were **deleted**, and for a demo holder who already used the app – each adds no transaction, no audit record
  and changes no balance; plus the production step list with and without `--with-demo`. With the old behaviour restored, the expired,
  deleted and visitor cases fail.

Once this fix is committed, `npm run db:prepare:production` is safe to run again (it was paused after the duplicate).

