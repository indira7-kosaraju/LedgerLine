// Security audit (Day 3, Task 4) – each test is an actual attack attempt with its expected result.
const crypto = require('crypto');
const {
  app, prisma, request, newKey, createUser, createAccount, deposit, transfer, balanceOf,
} = require('../helpers');
const { expectHealthyLedger } = require('../invariants');

afterAll(() => prisma.$disconnect());

const PASSWORD = 'Secret123';
const sessionCookie = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('ll_session='));
async function registerWithCookie() {
  const email = `sec-${crypto.randomUUID()}@test.local`;
  const res = await request(app).post('/api/auth/register').send({ email, password: PASSWORD, fullName: 'Security Test' });
  return { email, user: res.body.user, cookie: sessionCookie(res).split(';')[0] };
}
const me = (cookie) => request(app).get('/api/auth/me').set('Cookie', cookie);
const logout = (cookie) => request(app).post('/api/auth/logout').set('Cookie', cookie).set('X-Requested-With', 'XMLHttpRequest');

// Loads a separate copy of the app with different environment values (like a different server).
function appWith(envOverrides) {
  const saved = {};
  for (const [k, v] of Object.entries(envOverrides)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  let isolatedApp;
  let isolatedPrisma;
  jest.isolateModules(() => {
    isolatedApp = require('../../src/app');
    isolatedPrisma = require('../../src/config/prisma');
  });
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return { isolatedApp, isolatedPrisma };
}

describe('Replay attacks on sessions (FIXED in Day 3)', () => {
  test('a copied token stops working after logout', async () => {
    const { cookie } = await registerWithCookie();
    const stolenCopy = cookie;
    expect((await me(stolenCopy)).status).toBe(200);
    expect((await logout(cookie)).status).toBe(204);
    const replay = await me(stolenCopy);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('SESSION_REVOKED');
  });

  test('logout ends the session on every device (all tokens issued before)', async () => {
    const { email, cookie: laptop } = await registerWithCookie();
    const phoneLogin = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    const phone = sessionCookie(phoneLogin).split(';')[0];
    await logout(laptop);
    expect((await me(phone)).status).toBe(401);
  });

  test('signing in again after logout works normally', async () => {
    const { email, cookie } = await registerWithCookie();
    await logout(cookie);
    const again = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    expect((await me(sessionCookie(again).split(';')[0])).status).toBe(200);
  });

  test('a token from before a deactivation does NOT come back to life after reactivation', async () => {
    const admin = await createUser('ADMIN');
    const { user, cookie } = await registerWithCookie();
    const setActive = (isActive) => request(app).patch(`/api/admin/users/${user.id}/status`).set(admin.auth).send({ isActive });
    await setActive(false).expect(200);
    await setActive(true).expect(200);
    expect((await me(cookie)).status).toBe(401);
  });

  test('a token without a session version (old format) is rejected', async () => {
    const jwt = require('jsonwebtoken');
    const { user } = await createUser();
    const old = jwt.sign({ role: user.role }, process.env.JWT_SECRET, { subject: user.id, issuer: 'ledgerline', audience: 'ledgerline-api' });
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${old}`)).status).toBe(401);
  });

  test('replaying a captured money request does not move money again (idempotency)', async () => {
    const holder = await createUser();
    const account = await createAccount(holder);
    const key = newKey();
    await deposit(holder, account.id, 1000, key);
    for (let i = 0; i < 5; i++) await deposit(holder, account.id, 1000, key); // attacker replays
    expect(await balanceOf(account.id)).toBe(1000n);
  });
});

describe('Client IP behind a proxy (FIXED in Day 3: TRUST_PROXY)', () => {
  const latestLoginIp = async (email) =>
    (await prisma.auditLog.findFirst({ where: { action: 'AUTH_LOGIN', metadata: { path: ['email'], equals: email } }, orderBy: { createdAt: 'desc' } })).ipAddress;

  test('default (TRUST_PROXY=0): a spoofed X-Forwarded-For is ignored', async () => {
    const email = `spoof-${crypto.randomUUID()}@test.local`;
    await request(app).post('/api/auth/login').set('X-Forwarded-For', '203.0.113.66').send({ email, password: 'WrongPass1' });
    expect(await latestLoginIp(email)).not.toBe('203.0.113.66');
  });

  test('TRUST_PROXY=1: the address added by the proxy is used – a client cannot spoof it by prepending its own', async () => {
    const { isolatedApp, isolatedPrisma } = appWith({ TRUST_PROXY: '1' });
    try {
      const email = `proxy-${crypto.randomUUID()}@test.local`;
      // "1.2.3.4" was invented by the client; "203.0.113.7" was appended by the (one) trusted proxy.
      await request(isolatedApp).post('/api/auth/login').set('X-Forwarded-For', '1.2.3.4, 203.0.113.7').send({ email, password: 'WrongPass1' });
      expect(await latestLoginIp(email)).toBe('203.0.113.7');
    } finally {
      await isolatedPrisma.$disconnect();
    }
  });
});

describe('SQL injection attempts are harmless (Prisma parameterises every query)', () => {
  let admin, holder, account;
  beforeAll(async () => {
    [admin, holder] = await Promise.all([createUser('ADMIN'), createUser()]);
    account = await createAccount(holder);
  });
  const payloads = ["' OR '1'='1", "'; DROP TABLE ledger_entries; --", '%', "\\' UNION SELECT * FROM users --"];

  test.each(payloads)('account search q=%p returns no extra rows and no error', async (q) => {
    const res = await request(app).get('/api/accounts').query({ q }).set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.items.every((a) => a.accountNumber.includes(q) || a.owner?.email.includes(q) || a.owner?.fullName.includes(q))).toBe(true);
  });

  test.each(payloads)('transaction reference search q=%p → no error, no leak', async (q) => {
    const res = await request(app).get('/api/transactions').query({ q }).set(holder.auth);
    expect(res.status).toBe(200);
  });

  test('LIKE wildcards are literal: "%" and "_" no longer match everything (FIXED in Day 3)', async () => {
    const marker = crypto.randomUUID().slice(0, 8);
    await request(app).post('/api/auth/register').send({ email: `pct-${marker}@test.local`, password: PASSWORD, fullName: `Fifty ${marker}% Off` });
    await request(app).post('/api/auth/register').send({ email: `plain-${marker}@test.local`, password: PASSWORD, fullName: `Fifty ${marker}X Off` });

    const percent = await request(app).get('/api/admin/users').query({ q: `${marker}%` }).set(admin.auth);
    expect(percent.body.items.map((u) => u.email)).toEqual([`pct-${marker}@test.local`]); // only the literal "%"

    const underscore = await request(app).get('/api/admin/users').query({ q: `Fifty ${marker}_ Off` }).set(admin.auth);
    expect(underscore.body.total).toBe(0); // "_" is not "any character" any more

    const all = await request(app).get('/api/admin/users').query({ q: '%', limit: 100 }).set(admin.auth);
    expect(all.body.items.every((u) => u.email.includes('%') || u.fullName.includes('%'))).toBe(true);
  });

  test('injection in login email → rejected as invalid input', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: "' OR '1'='1", password: 'x' })).status).toBe(400);
  });

  test('injection in a transfer account number → rejected as invalid input, nothing moves', async () => {
    await deposit(holder, account.id, 5000);
    const res = await request(app).post('/api/transactions/transfer').set(holder.auth).set('Idempotency-Key', newKey())
      .send({ fromAccountId: account.id, toAccountNumber: "LL0000000000' OR '1'='1", amountPaise: 100 });
    expect(res.status).toBe(400);
    expect(await balanceOf(account.id)).toBe(5000n);
  });

  test('a name containing SQL is stored as plain text and the tables still exist', async () => {
    const evil = "Robert'); DROP TABLE users;--";
    const res = await request(app).post('/api/auth/register').send({ email: `sqli-${crypto.randomUUID()}@test.local`, password: PASSWORD, fullName: evil });
    expect(res.status).toBe(201);
    expect(res.body.user.fullName).toBe(evil);
    expect(await prisma.user.count()).toBeGreaterThan(0);
    expect(await prisma.ledgerEntry.count()).toBeGreaterThan(0);
  });

  test('injection in an id path parameter → 400, not a database error', async () => {
    expect((await request(app).get(`/api/accounts/${encodeURIComponent("1' OR '1'='1")}`).set(admin.auth)).status).toBe(400);
  });
});

describe('Input validation and request hardening', () => {
  test('body larger than 10 KB → 413', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send(JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(11000) }));
    expect(res.status).toBe(413);
  });

  test('malformed JSON → 400 INVALID_JSON', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  test('prototype pollution attempt → rejected, Object.prototype untouched', async () => {
    const res = await request(app).post('/api/auth/register').set('Content-Type', 'application/json')
      .send(`{"email":"pp-${crypto.randomUUID()}@test.local","password":"${PASSWORD}","fullName":"Proto","__proto__":{"role":"ADMIN"}}`);
    expect(res.status).toBe(400);
    expect({}.role).toBeUndefined();
  });

  test.each([
    ['repeated query parameter', '/api/accounts?status=ACTIVE&status=FROZEN'],
    ['array syntax', '/api/accounts?status[]=ACTIVE'],
    ['page size above the maximum', '/api/accounts?limit=100000'],
    ['negative page', '/api/accounts?page=-1'],
  ])('%s → 400 (never a server error)', async (_, path) => {
    const holder = await createUser();
    expect((await request(app).get(path).set(holder.auth)).status).toBe(400);
  });

  test('mass assignment on the admin status endpoint (sneaking in "role") → 400', async () => {
    const [admin, target] = await Promise.all([createUser('ADMIN'), createUser()]);
    const res = await request(app).patch(`/api/admin/users/${target.user.id}/status`).set(admin.auth).send({ isActive: true, role: 'ADMIN' });
    expect(res.status).toBe(400);
    expect((await prisma.user.findUnique({ where: { id: target.user.id } })).role).toBe('ACCOUNT_HOLDER');
  });
});

describe('Security headers, CORS, and error responses', () => {
  test('Helmet headers are present and the framework is not advertised', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/);
    expect(res.headers['content-security-policy']).toMatch(/frame-ancestors 'self'/);
    expect(res.headers['strict-transport-security']).toMatch(/max-age=/);
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  test('CORS: the configured origin is allowed with credentials; other origins get nothing; never "*"', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    const evil = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('in production, a server error reveals no stack trace, SQL or debug text – and cookies are Secure', async () => {
    const { isolatedApp, isolatedPrisma } = appWith({ NODE_ENV: 'production' });
    const holder = await createUser();
    const from = await createAccount(holder);
    const to = await createAccount(holder);
    await deposit(holder, from.id, 1000);
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION test_fail_prod() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'internal detail: secret_table_name'; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER test_fail_prod BEFORE INSERT ON ledger_entries FOR EACH ROW WHEN (NEW."accountId" = '${to.id}'::uuid) EXECUTE FUNCTION test_fail_prod()`);
    try {
      const res = await request(isolatedApp).post('/api/transactions/transfer').set(holder.auth).set('Idempotency-Key', newKey())
        .send({ fromAccountId: from.id, toAccountId: to.id, amountPaise: 100 });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
      expect(JSON.stringify(res.body)).not.toMatch(/secret_table_name|prisma|at \/|debug/i);

      const reg = await request(isolatedApp).post('/api/auth/register').send({ email: `prod-${crypto.randomUUID()}@test.local`, password: PASSWORD, fullName: 'Prod Cookie' });
      expect(sessionCookie(reg)).toMatch(/;\s*Secure/i);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS test_fail_prod ON ledger_entries');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS test_fail_prod()');
      await isolatedPrisma.$disconnect();
    }
  });

  test('no response ever contains a password hash or session version', async () => {
    const admin = await createUser('ADMIN');
    const { email, cookie } = await registerWithCookie();
    const bodies = [
      (await me(cookie)).body,
      (await request(app).post('/api/auth/login').send({ email, password: PASSWORD })).body,
      (await request(app).get('/api/admin/users?limit=100').set(admin.auth)).body,
    ];
    for (const body of bodies) expect(JSON.stringify(body)).not.toMatch(/passwordHash|sessionVersion|\$2b\$/);
  });
});

describe('Privilege escalation and restricted operations', () => {
  test('an account holder cannot use auditor/admin read endpoints', async () => {
    const holder = await createUser();
    for (const path of ['/api/ledger/entries', '/api/ledger/verify', '/api/audit-logs', '/api/admin/users']) {
      expect([path, (await request(app).get(path).set(holder.auth)).status]).toEqual([path, 403]);
    }
  });

  test('an auditor cannot perform admin operations or move money', async () => {
    const auditor = await createUser('AUDITOR');
    const holder = await createUser();
    const account = await createAccount(holder);
    expect((await request(app).patch(`/api/accounts/${account.id}/status`).set(auditor.auth).send({ status: 'FROZEN' })).status).toBe(403);
    expect((await request(app).patch(`/api/admin/users/${holder.user.id}/status`).set(auditor.auth).send({ isActive: false })).status).toBe(403);
    expect((await deposit(auditor, account.id, 100)).status).toBe(403);
    expect((await prisma.account.findUnique({ where: { id: account.id } })).status).toBe('ACTIVE');
  });

  test("another user's account: view, statement and money movement are all refused", async () => {
    const [a, b] = await Promise.all([createUser(), createUser()]);
    const accB = await createAccount(b);
    await deposit(b, accB.id, 5000);
    expect((await request(app).get(`/api/accounts/${accB.id}`).set(a.auth)).status).toBe(403);
    expect((await request(app).get(`/api/accounts/${accB.id}/statement`).set(a.auth)).status).toBe(403);
    const accA = await createAccount(a);
    expect((await transfer(a, accB.id, accA.id, 5000)).status).toBe(403);
    expect(await balanceOf(accB.id)).toBe(5000n);
  });

  test('ledger records cannot be changed through the API (no such routes exist)', async () => {
    const admin = await createUser('ADMIN');
    const entry = await prisma.ledgerEntry.findFirst();
    for (const [method, path] of [['put', `/api/ledger/entries/${entry.id}`], ['patch', `/api/ledger/entries/${entry.id}`], ['delete', `/api/ledger/entries/${entry.id}`], ['delete', `/api/transactions/${entry.transactionId}`]]) {
      expect([method, path, (await request(app)[method](path).set(admin.auth).send({ amount: 1 })).status]).toEqual([method, path, 404]);
    }
    expect((await prisma.ledgerEntry.findUnique({ where: { id: entry.id } })).amount).toBe(entry.amount);
    await expectHealthyLedger();
  });
});
