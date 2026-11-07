# LedgerLine – Security Audit (Day 3)

**Date:** 2026-11-07
**Scope:** backend API (Express + Prisma + PostgreSQL), session handling, money movement, ledger, frontend bundle, dependencies.
**Method:** every item was checked with a real attack attempt – automated in
`backend/tests/integration/security.test.js` (37 tests) unless noted – and the actual result was recorded.
Fixes were proven with mutation tests: each fix was undone temporarily and its test had to fail.

> LedgerLine handles **simulated money only**. This audit was done by the development team (with AI assistance);
> it is not an independent penetration test.

## Vulnerabilities found and fixed

| # | Finding | How it was found | Fix | Proof |
|---|---|---|---|---|
| V1 | **Token replay after logout** – a copied session token still worked after the user logged out (`/me` → 200) | Manual probe during the Day 3 review | `users.sessionVersion` is copied into every JWT (`sv`); logout raises it, so every older token is rejected (`401 SESSION_REVOKED`) | 4 tests fail when the check is removed; live re-test → 401 |
| V2 | **Reactivation revived old tokens** – deactivate → reactivate made a token stolen earlier work again | Manual probe (Task 4) | Admin status changes also raise `sessionVersion` | 1 test fails when removed |
| V3 | **No `trust proxy`** – behind a hosting proxy all clients share the proxy's IP: one attacker's failed logins would lock everyone out; audit IPs useless | Manual probe (all requests recorded as the same IP) | `TRUST_PROXY` = number of proxy hops (default 0); `true` is not allowed, so clients can't spoof `X-Forwarded-For` | Test with TRUST_PROXY=1: real hop used, client-invented address ignored; live re-test |
| V4 | **LIKE wildcard injection** – search `%` matched every row, `_` matched any character (not SQL injection; values were still parameterised) | Failing security test | `utils/escapeLike.js` escapes `\ % _` in all 3 searches | 2 tests fail when removed |
| V5 | **Lenient `Authorization` parsing** – `Bearer <token> <token>` was accepted | Failing test (Task 1) | Header must be exactly `Bearer <jwt>` | Test |
| V6 | **Dependency advisory** GHSA-ggr8-5vv4-36mx (`deepmerge-ts` < 8, high) via Prisma CLI's config loader – not reachable from HTTP | `npm audit` | `overrides: { "deepmerge-ts": "8.0.2" }` instead of a breaking Prisma 7 upgrade; Prisma validate/generate/migrate/seed re-verified | `npm audit` → 0 vulnerabilities |
| V7 | **Login response could leak new columns** – built as "user minus passwordHash" | Code review while adding `sessionVersion` | Responses built from an explicit allow-list (`toPublicUser`) | Test: no response contains `passwordHash`, `sessionVersion` or a bcrypt hash |

## Checklist results

| Area | Attack / check | Actual result |
|---|---|---|
| JWT authentication | tampered, foreign secret, `alg: none`, expired, wrong audience, malformed headers, deleted user, old token format | all **401** |
| Password hashing | stored value, timing of wrong password vs unknown email | bcrypt (cost 12; 10 in tests), plain text never stored or returned; equal ~0.2 s |
| Role-based authorization | holder → ledger/audit/admin APIs; auditor → admin operations and money movement; admin → money movement | all **403** |
| Account ownership | view / statement / withdraw / transfer from another user's account | **403**, balances unchanged, refusal audited |
| SQL injection | `' OR '1'='1`, `; DROP TABLE`, `UNION SELECT` in search, login, account number, id path, registration name | no error, no extra rows; injected name stored as plain text; no `$queryRawUnsafe` in application code |
| Input validation | body > 10 KB, malformed JSON, `__proto__`, repeated / array query params, huge `limit`, negative page, mass assignment (`role`) | 413 / 400, never 500; prototype not polluted |
| Rate limiting | 11th failed login, registration flood | **429** with `Retry-After` (`rateLimit.test.js`) |
| CORS | allowed origin, foreign origin, `CORS_ORIGIN=*` | allowed with credentials; foreign gets no `Access-Control-Allow-Origin`; `*` refused at startup |
| Helmet | response headers | CSP (`default-src 'self'`, `frame-ancestors 'self'`), `nosniff`, HSTS, `no-referrer`; no `X-Powered-By` |
| Environment secrets | real secret values searched in all project files and in the frontend production bundle | **0** files, **0** in bundle; `.env` / `.env.test` ignored by `.gitignore`; server refuses weak `JWT_SECRET` |
| Error handling | forced database error with `NODE_ENV=production` | body is only `{"error":{"code":"INTERNAL_ERROR","message":"Something went wrong"}}`; cookie gets `Secure` |
| Sensitive data exposure | `/me`, login, admin user list, transaction details | no hash, no session version, no internal owner ids; receivers don't see senders' balances |
| Ledger modification | PUT/PATCH/DELETE on ledger entries and transactions via API; UPDATE/DELETE/TRUNCATE via SQL | API **404** (no such routes); SQL refused by triggers (`ledgerSecurity.test.js`) |
| Duplicate requests | same Idempotency-Key replayed 5× | money moved once |
| Replay attacks | captured session token after logout; captured money request | **401** (V1 fixed); idempotent replay, no new movement |
| Privilege escalation | register with `role`, role inside a validly signed token, `role` in admin status update | 400 / ignored (DB role counts) / 400 |
| CSRF | cookie POST without `X-Requested-With` | **403** (`auth.test.js`) |

## Accepted risks / not covered

- Rate-limit counters live in process memory (reset on restart, not shared between instances) – needs a shared store for multiple servers.
- Logout signs the user out on **all** devices (simple, safe default; per-device sessions would need a sessions table).
- Account ids: a holder gets 403 for someone else's account and 404 for a non-existent one; ids are random UUIDs, so this reveals nothing useful in practice.
- Database superuser / host compromise is out of scope (triggers can be disabled by a superuser).
- HTTPS is required in production (`Secure` cookies, HSTS); local development runs on plain http.
- No independent penetration test.
