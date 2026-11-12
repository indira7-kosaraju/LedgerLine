# LedgerLine – API Reference

Base URL: `http://localhost:4000/api` (local) · production URL: see README → Deployment.
All request and response bodies are JSON. All examples below are **real responses** captured from the API (ids shortened).

## Conventions

### Authentication

| Client | How to authenticate |
|---|---|
| Browser (the React app) | `POST /auth/login` sets an **HttpOnly** cookie `ll_session` (`SameSite=Strict`, `Path=/api`). The browser sends it automatically. Every `POST`/`PATCH` must also send `X-Requested-With: XMLHttpRequest` (CSRF protection). |
| API tools (Thunder Client, curl, tests) | Send `X-Auth-Mode: bearer` on login/register to receive `token` in the body, then send `Authorization: Bearer <token>`. |

Tokens expire after 1 hour and are revoked immediately by logout or by an admin status change (`401 SESSION_REVOKED`).

### Roles

`ACCOUNT_HOLDER` (default for registration) · `ADMIN` (manages accounts and users, never moves money) · `AUDITOR` (read-only).
The role is read from the database on every request.

### Money

Amounts are **whole paise** – `500000` = ₹5,000.00. Requests send `amountPaise` as an integer or a string of digits
(no decimals, no negatives, no `1e5`). Responses return money as:

```json
{ "paise": "500000", "formatted": "₹5,000.00", "currency": "INR" }
```

`paise` is a string because JSON numbers lose precision above 2⁵³.

### Idempotency (money movement)

`POST /transactions/deposit`, `/withdraw` and `/transfer` **require** an `Idempotency-Key` header (16–100 characters:
letters, digits, `-`, `_`; a UUID is ideal). Use one key per operation:

| Situation | Result |
|---|---|
| New key | Executed → `201` |
| Same key + same request again | Original response returned, nothing moves again, header `Idempotent-Replayed: true` |
| Same key + different request | `422 IDEMPOTENCY_KEY_REUSED` |
| No key / invalid key | `400 IDEMPOTENCY_KEY_REQUIRED` / `400 IDEMPOTENCY_KEY_INVALID` |

Keys are scoped per user and remembered for 24 hours.

### Errors

Every error has the same shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Validation failed", "details": [{ "field": "email", "message": "Invalid email address" }] } }
```

| Status | Meaning | Common codes |
|---|---|---|
| 400 | Invalid input | `VALIDATION_ERROR`, `INVALID_JSON`, `SAME_ACCOUNT`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_INVALID`, `CANNOT_CHANGE_OWN_STATUS` |
| 401 | Not signed in / session invalid | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `SESSION_REVOKED` |
| 403 | Signed in but not allowed | `FORBIDDEN`, `NOT_OWNER`, `CSRF_REJECTED`, `ONBOARDING_INCOMPLETE` |
| 404 | Not found | `NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `DESTINATION_NOT_FOUND` |
| 409 | Conflict with existing data | `EMAIL_TAKEN`, `ONBOARDING_ALREADY_COMPLETE`, `ACCOUNT_LIMIT_REACHED`, `STATUS_UNCHANGED`, `ACCOUNT_CLOSED`, `BALANCE_NOT_ZERO`, `IDEMPOTENCY_IN_PROGRESS` |
| 413 | Body larger than 10 KB | `PAYLOAD_TOO_LARGE` |
| 422 | Valid request, refused by a business rule | `INSUFFICIENT_FUNDS`, `AMOUNT_EXCEEDS_LIMIT`, `ACCOUNT_NOT_ACTIVE`, `DESTINATION_NOT_ACTIVE`, `IDEMPOTENCY_KEY_REUSED` |
| 429 | Too many requests (`Retry-After` header in seconds) | `RATE_LIMITED` |
| 500 | Unexpected server error (no internal details are returned) | `INTERNAL_ERROR` |
| 503 | Sign-in temporarily unavailable – the rate-limit store (Redis) is unreachable, so login, register and change-password are refused rather than left unlimited | `SERVICE_UNAVAILABLE` |

Refused attempts (400/403/404/422 on money and account actions) are recorded in the audit log.

### Pagination

List endpoints accept `page` (default 1) and `limit` (default 20, max 100) and return `{ items, page, limit, total }`.

---

## Endpoint summary

| Method | Endpoint | Auth | Role |
|---|---|---|---|
| GET | [/health](#get-health) | – | – |
| GET | [/health/live](#get-healthlive) | – | – |
| GET | [/health/ready](#get-healthready) | – | – |
| POST | [/auth/register](#post-authregister) | – | – |
| POST | [/auth/login](#post-authlogin) | – | – |
| GET | [/auth/me](#get-authme) | ✅ | any |
| GET | [/onboarding](#get-onboarding) | ✅ | ACCOUNT_HOLDER |
| POST | [/onboarding](#post-onboarding) | ✅ | ACCOUNT_HOLDER |
| POST | [/auth/change-password](#post-authchange-password) | ✅ | any |
| POST | [/auth/logout](#post-authlogout) | optional | any |
| POST | [/accounts](#post-accounts) | ✅ | ACCOUNT_HOLDER |
| GET | [/accounts](#get-accounts) | ✅ | any (holders: own) |
| GET | [/accounts/:id](#get-accountsid) | ✅ | owner, ADMIN, AUDITOR |
| GET | [/accounts/:id/balance](#get-accountsidbalance) | ✅ | owner, ADMIN, AUDITOR |
| GET | [/accounts/:id/statement](#get-accountsidstatement) | ✅ | owner, ADMIN, AUDITOR |
| PATCH | [/accounts/:id/status](#patch-accountsidstatus) | ✅ | ADMIN |
| POST | [/transactions/deposit](#post-transactionsdeposit) | ✅ + key | ACCOUNT_HOLDER (own account) |
| POST | [/transactions/withdraw](#post-transactionswithdraw) | ✅ + key | ACCOUNT_HOLDER (own account) |
| POST | [/transactions/transfer](#post-transactionstransfer) | ✅ + key | ACCOUNT_HOLDER (own source) |
| GET | [/transactions](#get-transactions) | ✅ | any (holders: own) |
| GET | [/transactions/:id](#get-transactionsid) | ✅ | involved holder, ADMIN, AUDITOR |
| GET | [/ledger/entries](#get-ledgerentries) | ✅ | ADMIN, AUDITOR |
| GET | [/ledger/verify](#get-ledgerverify) | ✅ | ADMIN, AUDITOR |
| GET | [/audit-logs](#get-audit-logs) | ✅ | ADMIN, AUDITOR |
| GET | [/admin/users](#get-adminusers) | ✅ | ADMIN |
| PATCH | [/admin/users/:id/status](#patch-adminusersidstatus) | ✅ | ADMIN |

---

## Health

### GET /health

Server and database status. No authentication.

**Response 200**
```json
{ "status": "ok", "service": "ledgerline-backend", "database": "ok", "uptimeSeconds": 1145, "timestamp": "2026-11-07T17:11:56.000Z" }
```
**503** with `"status": "degraded", "database": "unreachable"` if PostgreSQL cannot be reached.

Health routes are **not** rate limited (the host polls them constantly).

### GET /health/live

Liveness: the process is running. Touches neither the database nor Redis.

**Response 200**
```json
{ "status": "alive", "uptimeSeconds": 3 }
```

### GET /health/ready

Readiness: may this server receive traffic? Render's health check (`render.yaml`) – a new deploy only goes live when this is 200.
Every check must pass within 2 seconds; the result is reused for 2 seconds (`Cache-Control: no-store`).

| Check | Passes when |
|---|---|
| `database` | a query works |
| `redis` | the rate-limit store answers `PING` (in development without `REDIS_URL`: `"not_configured"`, still ready) |
| `schema` | the 9 ledger-protection triggers and 5 CHECK constraints from the migrations exist (a missing migration shows up here) |
| `dbRole` | the API runs as a limited role: owns no tables, cannot create, no superuser/CREATEROLE/CREATEDB/BYPASSRLS/REPLICATION |

**Response 200** (captured from a local server)
```json
{ "status": "ready", "checks": { "database": "ok", "redis": "ok", "schema": "ok", "dbRole": "ok" }, "timestamp": "2026-11-12T08:06:09.860Z" }
```
**Response 503** – here with Redis stopped. Only the name of the failed check is returned; the reason goes to the server log.
```json
{ "status": "not_ready", "checks": { "database": "ok", "redis": "failed", "schema": "ok", "dbRole": "ok" }, "timestamp": "2026-11-12T08:06:22.955Z" }
```

---

## Authentication

### POST /auth/register

Creates an **ACCOUNT_HOLDER** with `onboardingStatus: "PENDING_PROFILE"` and signs in (sets the session cookie). The new user must
complete [onboarding](#onboarding) before opening accounts. Rate limit: 10 per hour per IP (counters in Redis).

**Request**
```json
{ "email": "docs@example.com", "password": "Secret123", "fullName": "Docs User" }
```
- `email`: valid email, trimmed and lower-cased · `password`: 8–72 bytes with upper case, lower case and a digit · `fullName`: 2–100 characters.
- Any other field (e.g. `role`, `isActive`) → `400`.

**Response 201** (`token` only when the request sends `X-Auth-Mode: bearer`)
```json
{
  "user": { "id": "d5ff2ab0-…", "email": "docs@example.com", "fullName": "Docs User", "role": "ACCOUNT_HOLDER", "isActive": true,
            "onboardingStatus": "PENDING_PROFILE",
            "createdAt": "2026-11-07T17:11:56.056Z", "updatedAt": "2026-11-07T17:11:56.056Z" },
  "token": "eyJhbGciOiJIUzI1NiIs…"
}
```
**Errors:** `400 VALIDATION_ERROR` (with `details` per field) · `409 EMAIL_TAKEN` · `429 RATE_LIMITED` · `503 SERVICE_UNAVAILABLE`

### POST /auth/login

**Request** `{ "email": "asha.holder@example.com", "password": "DemoPass123" }`

**Response 200** – same shape as register (`user`, and `token` with `X-Auth-Mode: bearer`); sets the session cookie.

**Errors:** `401 INVALID_CREDENTIALS` – the same message for a wrong password, an unknown email and a deactivated user
```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Invalid email or password" } }
```
`429 RATE_LIMITED` (with `Retry-After`) after 10 failed logins per 15 minutes **per IP**, or 10 failed attempts per 15 minutes **per
account** from any IP (wrong current passwords on change-password count too). While an account is locked, even the correct password
gets 429 – with the same response for existing and unknown emails, so the limit reveals nothing about which accounts exist.
Successful logins do not count.

`503 SERVICE_UNAVAILABLE` if Redis is unreachable (captured from a local server with Redis stopped):
```json
{ "error": { "code": "SERVICE_UNAVAILABLE", "message": "Sign-in is temporarily unavailable. Please try again in a minute." } }
```

### GET /auth/me

The signed-in user. **Response 200**
```json
{ "user": { "id": "01d46546-…", "email": "asha.holder@example.com", "fullName": "Asha Verma", "role": "ACCOUNT_HOLDER",
            "isActive": true, "createdAt": "…", "updatedAt": "…" } }
```
**Errors:** `401 UNAUTHENTICATED` (no/invalid/expired token) · `401 SESSION_REVOKED`
```json
{ "error": { "code": "SESSION_REVOKED", "message": "Your session has ended. Please sign in again." } }
```

### POST /auth/change-password

Changes your own password. Needs the current password. **Every other session of this user is revoked** (other browsers, copied
tokens → `401 SESSION_REVOKED`); this browser receives a new session cookie and stays signed in. Audited as `AUTH_CHANGE_PASSWORD`.

**Request** `{ "currentPassword": "Secret123", "newPassword": "Changed456" }` – `newPassword` follows the registration rules.

**Response 200** – `user` (same shape as `/auth/me`), plus `token` with `X-Auth-Mode: bearer`; sets the new session cookie.
```json
{ "user": { "id": "ebabb839-…", "email": "capture-5c4d61@example.com", "fullName": "Capture User", "role": "ACCOUNT_HOLDER",
            "isActive": true, "createdAt": "…", "updatedAt": "…" } }
```
**Errors:** `400 INVALID_CURRENT_PASSWORD` (400, not 401 – the session itself is still valid)
```json
{ "error": { "code": "INVALID_CURRENT_PASSWORD", "message": "Current password is incorrect",
             "details": [{ "field": "currentPassword", "message": "Current password is incorrect" }] } }
```
`400 VALIDATION_ERROR` – weak new password, or the same as the current one
(`"New password must be different from the current password"`) · `401 UNAUTHENTICATED` · `429 RATE_LIMITED` (wrong current passwords
count toward the failed-login limits per IP and per account) · `503 SERVICE_UNAVAILABLE` (Redis unreachable).

### POST /auth/logout

Clears the cookie and **revokes every token issued to this user so far** (signs out on all devices). Always succeeds.

**Response 204** (no body)

---

## Onboarding

Step 4. A new account holder can sign in at once, but **cannot open accounts or move money** until onboarding is complete:
`POST /accounts`, `/transactions/deposit`, `/withdraw` and `/transfer` answer `403 ONBOARDING_INCOMPLETE` (audited) – the
database refuses such accounts too. Approval is **automatic**: a valid profile plus the current terms approves the user at once.
Users that existed before step 4 were approved by the migration. Admins and auditors need no onboarding.

> LedgerLine is a demo: the profile must contain **made-up** data, never real personal information.

```json
{ "error": { "code": "ONBOARDING_INCOMPLETE", "message": "Complete your onboarding before opening accounts or moving money" } }
```

### GET /onboarding

The caller's own status and profile, plus the rules the form must follow (`requirements` – the frontend reads these, so it
always matches the server). ACCOUNT_HOLDER only; admins and auditors get 403.

**Response 200** (captured locally; `states` shortened here – the real list has all 36 states and union territories)
```json
{ "onboarding": { "status": "PENDING_PROFILE", "onboardedAt": null, "termsAcceptedVersion": null, "termsAcceptedAt": null, "profile": null,
  "requirements": { "termsVersion": "2026-11-12", "minimumAge": 18, "states": ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "…"],
                    "occupations": ["SALARIED", "SELF_EMPLOYED", "BUSINESS_OWNER", "STUDENT", "HOMEMAKER", "RETIRED", "OTHER"] } } }
```

### POST /onboarding

**Request**
```json
{ "dateOfBirth": "1990-01-01", "phone": "+91 90000 00000", "city": "Demo City", "state": "Karnataka", "pinCode": "560001",
  "occupation": "OTHER", "acceptTerms": true, "termsVersion": "2026-11-12" }
```
| Field | Rule |
|---|---|
| `dateOfBirth` | a real date `YYYY-MM-DD`; age 18–120 |
| `phone` | Indian mobile number: 10 digits starting 6–9; `+91`, `0`, spaces and hyphens allowed – stored as `+91XXXXXXXXXX` |
| `city` | 2–60 letters, spaces, `.`, `'`, `-` |
| `state` | one of the 36 states / union territories from `requirements.states` |
| `pinCode` | 6 digits, not starting with 0 |
| `occupation` | one of `requirements.occupations` |
| `acceptTerms` | must be `true` |
| `termsVersion` | must equal the current `requirements.termsVersion` (the user accepted what they were shown) |

Any other field (e.g. `"onboardingStatus": "APPROVED"`) → `400`, so nobody can approve themselves.

**Response 200** – approved; `user` is the updated user, `onboarding` the same shape as GET (captured locally, `states` shortened)
```json
{ "user": { "id": "b6a1be4d-…", "email": "docs-onb-…@example.com", "fullName": "Docs Onboarding", "role": "ACCOUNT_HOLDER", "isActive": true,
            "onboardingStatus": "APPROVED", "createdAt": "2026-11-12T09:16:47.924Z", "updatedAt": "2026-11-12T09:16:48.014Z" },
  "onboarding": { "status": "APPROVED", "onboardedAt": "2026-11-12T09:16:48.011Z", "termsAcceptedVersion": "2026-11-12",
                  "termsAcceptedAt": "2026-11-12T09:16:48.011Z",
                  "profile": { "dateOfBirth": "1990-01-01", "phone": "+919000000000", "city": "Demo City", "state": "Karnataka",
                               "pinCode": "560001", "occupation": "OTHER", "createdAt": "2026-11-12T09:16:48.013Z" },
                  "requirements": { "…": "…" } } }
```
The audit log records `ONBOARDING_COMPLETE` with `{ "approval": "AUTOMATIC", "termsVersion": "2026-11-12" }` – no personal details.

**Errors:** `400 VALIDATION_ERROR` with `details` per field, e.g.
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Validation failed", "details": [{ "field": "dateOfBirth", "message": "You must be at least 18 years old" }] } }
```
`409 ONBOARDING_ALREADY_COMPLETE` (also for simultaneous submissions – exactly one succeeds) · `403 FORBIDDEN` for admins/auditors ·
`401 UNAUTHENTICATED`.

---

## Accounts

### POST /accounts

Opens a new account for the signed-in holder. Balance always starts at ₹0; the owner is always the caller.
Maximum 5 accounts per user. Requires completed [onboarding](#onboarding) (otherwise `403 ONBOARDING_INCOMPLETE`).

**Request** `{}` (optional `{ "currency": "INR" }`; `balance`, `ownerId` etc. are rejected)

**Response 201**
```json
{ "account": { "id": "9203a4eb-…", "accountNumber": "LL3862467571", "type": "CUSTOMER", "status": "ACTIVE", "currency": "INR",
               "balance": { "paise": "0", "formatted": "₹0.00", "currency": "INR" }, "ownerId": "d5ff2ab0-…",
               "createdAt": "…", "updatedAt": "…" } }
```
**Errors:** `400 VALIDATION_ERROR` · `403 FORBIDDEN` (ADMIN/AUDITOR) · `409 ACCOUNT_LIMIT_REACHED`

### GET /accounts

Holders get **only their own** accounts (filters cannot widen that). Admins and auditors get all accounts.

**Query:** `page`, `limit`, `status` (`ACTIVE`/`FROZEN`/`CLOSED`), `type` (`CUSTOMER`/`SYSTEM`, admin/auditor), `ownerId` (admin/auditor),
`q` (search in account number, owner name or email).

**Response 200** – `summary.totalBalance` is summed by PostgreSQL over the customer accounts in the result
```json
{
  "items": [{ "id": "2929c028-…", "accountNumber": "LL2750024825", "type": "CUSTOMER", "status": "ACTIVE", "currency": "INR",
              "balance": { "paise": "150000", "formatted": "₹1,500.00", "currency": "INR" }, "ownerId": "01d46546-…",
              "owner": { "id": "01d46546-…", "email": "asha.holder@example.com", "fullName": "Asha Verma" },
              "createdAt": "…", "updatedAt": "…" }],
  "page": 1, "limit": 20, "total": 2,
  "summary": { "totalBalance": { "paise": "550000", "formatted": "₹5,500.00", "currency": "INR" } }
}
```

### GET /accounts/:id

One account (same shape as a list item, inside `{ "account": … }`).

**Errors:** `400 VALIDATION_ERROR` (not a UUID) · `403 FORBIDDEN` (someone else's account; the attempt is audited) · `404 NOT_FOUND`
```json
{ "error": { "code": "FORBIDDEN", "message": "You do not have access to this account" } }
```

### GET /accounts/:id/balance

**Response 200**
```json
{ "accountId": "2929c028-…", "accountNumber": "LL2750024825", "status": "ACTIVE",
  "balance": { "paise": "150000", "formatted": "₹1,500.00", "currency": "INR" }, "asOf": "2026-11-07T17:11:56.413Z" }
```
Errors as for `GET /accounts/:id`.

### GET /accounts/:id/statement

Ledger entries for the account (newest first) and a **proof** that the stored balance equals credits − debits.

**Query:** `page`, `limit`, `from`, `to` (ISO dates)

**Response 200**
```json
{
  "account": { "id": "2929c028-…", "accountNumber": "LL2750024825", "type": "CUSTOMER", "status": "ACTIVE" },
  "summary": {
    "currentBalance": { "paise": "150000", "formatted": "₹1,500.00", "currency": "INR" },
    "totalCredits":   { "paise": "150000", "formatted": "₹1,500.00", "currency": "INR" },
    "totalDebits":    { "paise": "0", "formatted": "₹0.00", "currency": "INR" },
    "ledgerBalance":  { "paise": "150000", "formatted": "₹1,500.00", "currency": "INR" },
    "balanceMatchesLedger": true
  },
  "entries": [{ "id": "df2d4575-…", "entryNumber": "16260", "accountId": "2929c028-…", "accountNumber": "LL2750024825",
                "direction": "CREDIT", "amount": { "paise": "150000", "formatted": "₹1,500.00", "currency": "INR" },
                "balanceAfter": { "paise": "150000", "formatted": "₹1,500.00", "currency": "INR" }, "createdAt": "…",
                "transaction": { "id": "ef772920-…", "reference": "TXN-20261107-2D382B92BA", "type": "TRANSFER", "description": "Savings" },
                "counterpartyAccountNumber": "LL5857711956" }],
  "page": 1, "limit": 2, "total": 1
}
```

### PATCH /accounts/:id/status

**Role:** ADMIN. Freeze, unfreeze or close a customer account (runs with a row lock, audited).

**Request** `{ "status": "FROZEN", "reason": "Docs example" }` – `status`: `ACTIVE` · `FROZEN` · `CLOSED`; `reason` optional (3–200 characters).

**Response 200** – `{ "account": { …, "status": "FROZEN" } }`

**Errors:** `403 FORBIDDEN` (not an admin, or the SYSTEM account) · `409 STATUS_UNCHANGED` · `409 ACCOUNT_CLOSED` (closed accounts can't be reopened) ·
`409 BALANCE_NOT_ZERO` (closing requires ₹0)

---

## Transactions

All three money endpoints: **role** ACCOUNT_HOLDER, **header** `Idempotency-Key` required, executed in one PostgreSQL transaction
(row locks in sorted order → rules on the locked rows → both balances → transaction → DEBIT + CREDIT ledger entries → audit row).
They return only the **caller's** account balance, never the other side's. Limits: ₹1,00,000 per deposit, ₹5,00,000 per withdrawal or transfer.

### POST /transactions/deposit

Simulated money from the SYSTEM account into one of your accounts.

**Request**
```json
{ "accountId": "2929c028-…", "amountPaise": "25000", "description": "Docs deposit" }
```

**Response 201**
```json
{
  "transaction": { "id": "97355d6a-…", "reference": "TXN-20261107-75AFB7161E", "type": "DEPOSIT", "status": "COMPLETED",
                   "amount": { "paise": "25000", "formatted": "₹250.00", "currency": "INR" },
                   "fromAccount": { "id": "3721360c-…", "accountNumber": "LL-SYSTEM-EXTERNAL" },
                   "toAccount": { "id": "2929c028-…", "accountNumber": "LL2750024825" },
                   "initiatedById": "01d46546-…", "description": "Docs deposit", "createdAt": "2026-11-07T17:11:56.492Z" },
  "account": { "id": "2929c028-…", "accountNumber": "LL2750024825", "balance": { "paise": "175000", "formatted": "₹1,750.00", "currency": "INR" } }
}
```
The same request with the same key again → **201** with the identical content and `Idempotent-Replayed: true`.

**Errors**
```json
{ "error": { "code": "IDEMPOTENCY_KEY_REQUIRED", "message": "An Idempotency-Key header is required for money movement" } }
{ "error": { "code": "IDEMPOTENCY_KEY_REUSED", "message": "This Idempotency-Key was already used for a different request. Use a new key for a new operation." } }
{ "error": { "code": "VALIDATION_ERROR", "message": "Validation failed", "details": [{ "field": "amountPaise", "message": "amountPaise must be greater than 0" }] } }
```
`403 NOT_OWNER` (someone else's account) · `404 ACCOUNT_NOT_FOUND` · `422 ACCOUNT_NOT_ACTIVE` · `422 AMOUNT_EXCEEDS_LIMIT`

### POST /transactions/withdraw

**Request** `{ "accountId": "2929c028-…", "amountPaise": "10000", "description": "Cash" }`

**Response 201** – same shape as deposit (`fromAccount` = your account, `toAccount` = `LL-SYSTEM-EXTERNAL`).

**Errors:** as deposit, plus
- `422 INSUFFICIENT_FUNDS` – message format `"Insufficient funds: available ₹<current balance>"`
- `422 AMOUNT_EXCEEDS_LIMIT` – `"Maximum per withdrawal is ₹5,00,000.00"` (checked before the balance)

### POST /transactions/transfer

**Request** – exactly one of `toAccountId` (any account id) or `toAccountNumber` (`LL` + 10 digits)
```json
{ "fromAccountId": "2929c028-…", "toAccountNumber": "LL1983710513", "amountPaise": "5000", "description": "Docs transfer" }
```

**Response 201** – same shape; `account` is the **sender's** account with its new balance.

**Errors:** as withdraw, plus `400 SAME_ACCOUNT` · `403 NOT_OWNER` (source isn't yours) · `404 DESTINATION_NOT_FOUND` (unknown account or the SYSTEM account) ·
`422 DESTINATION_NOT_ACTIVE` (frozen/closed destination)
```json
{ "error": { "code": "NOT_OWNER", "message": "You can only move money from your own account" } }
{ "error": { "code": "DESTINATION_NOT_FOUND", "message": "Destination account not found" } }
```

### GET /transactions

Holders get transactions touching their own accounts; admins and auditors get all.

**Query:** `page`, `limit`, `accountId`, `type` (`DEPOSIT`/`WITHDRAWAL`/`TRANSFER`), `q` (search by reference)

**Response 200** – `{ "items": [ <transaction> ], "page": 1, "limit": 2, "total": 9 }` (transaction shape as in deposit)

### GET /transactions/:id

One transaction and its ledger entries. **Privacy:** an account holder only receives the entries on **their own** accounts
(`entriesHidden` counts the others) and does not see who sent money to them; admins and auditors see everything.

**Response 200** (sender's view)
```json
{
  "transaction": { …, "reference": "TXN-20261107-5F293DFA3D", "type": "TRANSFER",
                   "initiatedBy": { "id": "01d46546-…", "fullName": "Asha Verma", "email": "asha.holder@example.com" } },
  "ledgerEntries": [{ "entryNumber": "16267", "accountNumber": "LL2750024825", "direction": "DEBIT",
                      "amount": { "paise": "5000", … }, "balanceAfter": { "paise": "160000", … }, … }],
  "entriesHidden": 1
}
```
**Errors:** `403 FORBIDDEN` (not involved; audited) · `404 NOT_FOUND`

---

## Ledger (ADMIN, AUDITOR)

### GET /ledger/entries

**Query:** `page`, `limit`, `accountId`, `transactionId`

**Response 200**
```json
{ "items": [{ "id": "9eea6210-…", "entryNumber": "16270", "accountId": "25d02e20-…", "accountNumber": "LL5857711956",
              "direction": "CREDIT", "amount": { "paise": "1000", "formatted": "₹10.00", "currency": "INR" },
              "balanceAfter": { "paise": "401000", "formatted": "₹4,010.00", "currency": "INR" }, "createdAt": "…",
              "transaction": { "id": "d0b0b080-…", "reference": "TXN-20261107-577D0715E3", "type": "TRANSFER", "description": null },
              "counterpartyAccountNumber": "LL2750024825" }],
  "page": 1, "limit": 2, "total": 15820 }
```

### GET /ledger/verify

Recomputes the books from every ledger entry in one consistent snapshot.

**Response 200** (books balanced) · **500** with the same shape and `"ok": false` if a problem is found
```json
{
  "ok": true, "checkedAt": "2026-11-07T17:11:56.595Z",
  "counts": { "accounts": 2540, "transactions": 7910, "ledgerEntries": 15820 },
  "sumOfAllBalances": { "paise": "0", "formatted": "₹0.00", "currency": "INR" },
  "checks": { "balancesMatchLedger": true, "everyTransactionBalanced": true, "runningBalancesConsistent": true, "moneyConserved": true },
  "problems": { "balanceMismatches": [], "unbalancedTransactions": [], "brokenChains": [] }
}
```
**Errors (both ledger endpoints):** `403 FORBIDDEN` for account holders
```json
{ "error": { "code": "FORBIDDEN", "message": "You do not have permission to perform this action" } }
```

---

## Audit log (ADMIN, AUDITOR)

### GET /audit-logs

**Query:** `page`, `limit`, `outcome` (`SUCCESS`/`REFUSED`/`ERROR`), `action` (exact) or `actionPrefix` (e.g. `TXN_`), `actorId`, `entityId`

**Response 200** (`?outcome=REFUSED&actionPrefix=TXN_&limit=1`)
```json
{ "items": [{ "id": "284f603b-…", "actorId": "01d46546-…", "action": "TXN_TRANSFER", "outcome": "REFUSED",
              "entityType": "Account", "entityId": "2929c028-…", "reason": "DESTINATION_NOT_FOUND",
              "metadata": { "amountPaise": "100", "fromAccountId": "2929c028-…", "toAccountId": "aea2539e-…" },
              "ipAddress": "::1", "userAgent": "node", "createdAt": "…",
              "actor": { "id": "01d46546-…", "email": "asha.holder@example.com", "role": "ACCOUNT_HOLDER" } }],
  "page": 1, "limit": 1, "total": 2743 }
```

---

## Admin (ADMIN)

### GET /admin/users

**Query:** `page`, `limit`, `role`, `status` (`ACTIVE`/`INACTIVE`), `q` (name or email)

**Response 200**
```json
{ "items": [{ "id": "388d4358-…", "email": "ravi.holder@example.com", "fullName": "Ravi Kumar", "role": "ACCOUNT_HOLDER",
              "isActive": true, "createdAt": "…", "updatedAt": "…" }],
  "page": 1, "limit": 20, "total": 8 }
```

### PATCH /admin/users/:id/status

Activate or deactivate a user. Any change also **revokes all of that user's existing sessions**.

**Request** `{ "isActive": false }`

**Response 200** – `{ "user": { … } }`

**Errors:** `400 CANNOT_CHANGE_OWN_STATUS` · `400 VALIDATION_ERROR` (e.g. sending `role`) · `403 FORBIDDEN` · `404 NOT_FOUND`
```json
{ "error": { "code": "CANNOT_CHANGE_OWN_STATUS", "message": "You cannot change your own status" } }
```
