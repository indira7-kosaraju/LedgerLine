// End-to-end smoke test for Day 1 (Tasks 1–6).
// Start the server first (npm run dev), then in a second terminal: npm run smoke
// Creates two fresh users on every run, so it can be run repeatedly.
require('dotenv').config({ quiet: true });
const crypto = require('crypto');

const BASE = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 4000}/api`;
let passed = 0;
let failed = 0;

async function call(method, path, token, body, extraHeaders = {}) {
  // Money movement requires an Idempotency-Key: use a fresh one unless the caller passes its own.
  const isMoney = method === 'POST' && path.startsWith('/transactions/');
  const res = await fetch(BASE + path, {
    method,
    // X-Auth-Mode: bearer → login/register also return the token in the body (API-client mode).
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Mode': 'bearer',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(isMoney && { 'Idempotency-Key': crypto.randomUUID() }),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // empty body
  }
  return { status: res.status, body: json, headers: res.headers };
}

function check(name, condition, detail = '') {
  if (condition) passed++;
  else failed++;
  console.log(`${condition ? '  ✅' : '  ❌'} ${name}${detail ? `  (${detail})` : ''}`);
}

function section(title) {
  console.log(`\n${title}`);
}

async function main() {
  const run = Date.now();
  const password = 'Smoke123pass';

  section('Task 1 – Server');
  const health = await call('GET', '/health');
  check('GET /health returns 200', health.status === 200, health.body?.status);
  check('unknown route returns 404', (await call('GET', '/does-not-exist')).status === 404);

  section('Task 2 – Database');
  check('health reports database ok', health.body?.database === 'ok', health.body?.database);

  section('Task 3 – Authentication');
  const reg1 = await call('POST', '/auth/register', null, { email: `sender${run}@smoke.test`, password, fullName: 'Smoke Sender' });
  check('register user 1 → 201', reg1.status === 201, `role ${reg1.body?.user?.role}`);
  check('password hash never returned', !JSON.stringify(reg1.body).includes('passwordHash'));
  const reg2 = await call('POST', '/auth/register', null, { email: `receiver${run}@smoke.test`, password, fullName: 'Smoke Receiver' });
  check('register user 2 → 201', reg2.status === 201);
  check('duplicate email → 409', (await call('POST', '/auth/register', null, { email: `sender${run}@smoke.test`, password, fullName: 'Dup' })).status === 409);
  check(
    'self-assigning ADMIN role → 400',
    (await call('POST', '/auth/register', null, { email: `evil${run}@smoke.test`, password, fullName: 'Evil', role: 'ADMIN' })).status === 400
  );
  const login = await call('POST', '/auth/login', null, { email: `sender${run}@smoke.test`, password });
  check('login → 200 with token', login.status === 200 && Boolean(login.body?.token));
  check('wrong password → 401', (await call('POST', '/auth/login', null, { email: `sender${run}@smoke.test`, password: 'Wrong123x' })).status === 401);
  let sender = login.body.token;
  const receiver = reg2.body.token;
  check('GET /auth/me with token → 200', (await call('GET', '/auth/me', sender)).status === 200);
  check('GET /auth/me without token → 401', (await call('GET', '/auth/me')).status === 401);
  check('GET /auth/me with tampered token → 401', (await call('GET', '/auth/me', `${sender}x`)).status === 401);

  section('Day 2 – Cookie session (how the browser app signs in)');
  const browserLogin = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `sender${run}@smoke.test`, password }),
  });
  const browserBody = await browserLogin.json();
  const setCookie = browserLogin.headers.get('set-cookie') || '';
  check('browser login → 200 without token in body', browserLogin.status === 200 && !browserBody.token);
  check('session cookie is HttpOnly + SameSite=Strict', /ll_session=/.test(setCookie) && /HttpOnly/i.test(setCookie) && /SameSite=Strict/i.test(setCookie));
  const cookie = setCookie.split(';')[0];
  const cookieMe = await fetch(`${BASE}/auth/me`, { headers: { Cookie: cookie } });
  check('GET /auth/me with cookie → 200', cookieMe.status === 200);
  const forged = await fetch(`${BASE}/accounts`, { method: 'POST', headers: { Cookie: cookie } });
  check('cookie POST without X-Requested-With → 403 (CSRF blocked)', forged.status === 403, (await forged.json()).error?.code);
  const logout = await fetch(`${BASE}/auth/logout`, { method: 'POST', headers: { Cookie: cookie, 'X-Requested-With': 'XMLHttpRequest' } });
  check('logout → 204 and clears cookie', logout.status === 204 && /ll_session=;/.test(logout.headers.get('set-cookie') || ''));
  // Logout revokes ALL of this user's sessions on the server (Day 3 fix), including the Bearer token above.
  check('after logout, the old token is revoked (replay blocked)', (await call('GET', '/auth/me', sender)).status === 401);
  sender = (await call('POST', '/auth/login', null, { email: `sender${run}@smoke.test`, password })).body.token;
  check('signing in again gives a working token', (await call('GET', '/auth/me', sender)).status === 200);

  section('Task 4 – Roles');
  const admin = (await call('POST', '/auth/login', null, { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD })).body?.token;
  const auditor = (await call('POST', '/auth/login', null, { email: process.env.SEED_AUDITOR_EMAIL, password: process.env.SEED_AUDITOR_PASSWORD })).body?.token;
  check('admin can log in (seeded)', Boolean(admin), admin ? '' : 'run npm run db:seed and check SEED_* in .env');
  check('auditor can log in (seeded)', Boolean(auditor));
  check('holder → audit logs → 403', (await call('GET', '/audit-logs', sender)).status === 403);
  check('auditor → audit logs → 200', (await call('GET', '/audit-logs', auditor)).status === 200);
  check('auditor → manage users → 403', (await call('GET', '/admin/users', auditor)).status === 403);
  check('admin → manage users → 200', (await call('GET', '/admin/users', admin)).status === 200);

  section('Task 5 – Accounts');
  const acc1 = await call('POST', '/accounts', sender);
  check('create account → 201, balance ₹0.00', acc1.status === 201 && acc1.body?.account?.balance?.formatted === '₹0.00');
  const acc2 = await call('POST', '/accounts', receiver);
  const A = acc1.body.account;
  const B = acc2.body.account;
  check('admin cannot create account → 403', (await call('POST', '/accounts', admin)).status === 403);
  check('client cannot set balance → 400', (await call('POST', '/accounts', sender, { balance: 999999 })).status === 400);
  check('list shows only own accounts', (await call('GET', '/accounts', sender)).body?.total === 1);
  check('view own account → 200', (await call('GET', `/accounts/${A.id}`, sender)).status === 200);
  check("view other user's account → 403", (await call('GET', `/accounts/${B.id}`, sender)).status === 403);
  check("view other user's balance → 403", (await call('GET', `/accounts/${B.id}/balance`, sender)).status === 403);
  check('auditor views any balance → 200', (await call('GET', `/accounts/${B.id}/balance`, auditor)).status === 200);

  section('Task 6 – Money movement (Day 1 scenario)');
  const balanceOf = async (token, id) => (await call('GET', `/accounts/${id}/balance`, token)).body?.balance?.formatted;
  let r = await call('POST', '/transactions/deposit', sender, { accountId: A.id, amountPaise: 500000 });
  check('deposit ₹5,000 → 201', r.status === 201, r.body?.account?.balance?.formatted);
  r = await call('POST', '/transactions/deposit', sender, { accountId: A.id, amountPaise: 200000 });
  check('deposit ₹2,000 → 201', r.status === 201, r.body?.account?.balance?.formatted);
  r = await call('POST', '/transactions/withdraw', sender, { accountId: A.id, amountPaise: 100000 });
  check('withdraw ₹1,000 → 201', r.status === 201, r.body?.account?.balance?.formatted);
  r = await call('POST', '/transactions/transfer', sender, { fromAccountId: A.id, toAccountNumber: B.accountNumber, amountPaise: 50000 });
  check('transfer ₹500 → 201', r.status === 201, r.body?.account?.balance?.formatted);
  const senderBalance = await balanceOf(sender, A.id);
  const receiverBalance = await balanceOf(receiver, B.id);
  check('sender final balance ₹5,500.00', senderBalance === '₹5,500.00', senderBalance);
  check('receiver balance ₹500.00', receiverBalance === '₹500.00', receiverBalance);

  section('Task 6 – Refusals');
  r = await call('POST', '/transactions/withdraw', sender, { accountId: A.id, amountPaise: 10000000 });
  check('withdraw more than balance → 422', r.status === 422, r.body?.error?.code);
  r = await call('POST', '/transactions/withdraw', sender, { accountId: B.id, amountPaise: 100 });
  check("withdraw from other user's account → 403", r.status === 403, r.body?.error?.code);
  check('negative amount → 400', (await call('POST', '/transactions/deposit', sender, { accountId: A.id, amountPaise: -100 })).status === 400);
  check('decimal amount → 400', (await call('POST', '/transactions/deposit', sender, { accountId: A.id, amountPaise: 10.5 })).status === 400);
  check('admin cannot move money → 403', (await call('POST', '/transactions/deposit', admin, { accountId: A.id, amountPaise: 100 })).status === 403);
  check('balances unchanged after refusals', (await balanceOf(sender, A.id)) === '₹5,500.00' && (await balanceOf(receiver, B.id)) === '₹500.00');

  section('Day 2 – Idempotency');
  const key = crypto.randomUUID();
  const first = await call('POST', '/transactions/deposit', sender, { accountId: A.id, amountPaise: 100 }, { 'Idempotency-Key': key });
  const retry = await call('POST', '/transactions/deposit', sender, { accountId: A.id, amountPaise: 100 }, { 'Idempotency-Key': key });
  check('retry with same key → same transaction, replayed', retry.status === 201 && retry.body?.transaction?.id === first.body?.transaction?.id && retry.headers.get('idempotent-replayed') === 'true');
  check('balance moved once (₹5,501.00)', (await balanceOf(sender, A.id)) === '₹5,501.00', await balanceOf(sender, A.id));
  const reused = await call('POST', '/transactions/deposit', sender, { accountId: A.id, amountPaise: 999 }, { 'Idempotency-Key': key });
  check('same key, different amount → 422', reused.status === 422 && reused.body?.error?.code === 'IDEMPOTENCY_KEY_REUSED');
  const noKeyRes = await fetch(`${BASE}/transactions/deposit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sender}` }, body: JSON.stringify({ accountId: A.id, amountPaise: 100 }) });
  check('missing key → 400', noKeyRes.status === 400);

  section('Task 6 – Ledger proof');
  const statement = await call('GET', `/accounts/${A.id}/statement`, sender);
  check('statement has 5 entries', statement.body?.total === 5, `total ${statement.body?.total}`);
  check('statement balance matches ledger', statement.body?.summary?.balanceMatchesLedger === true);
  check('sender sees own 5 transactions', (await call('GET', '/transactions', sender)).body?.total === 5);
  const refused = await call('GET', `/audit-logs?outcome=REFUSED&actorId=${reg1.body.user.id}`, auditor);
  check('refused attempts are in the audit log', refused.body?.total >= 3, refused.body?.items?.map((i) => i.reason).join(', '));
  const verify = await call('GET', '/ledger/verify', auditor);
  check('ledger verify: ok', verify.status === 200 && verify.body?.ok === true, JSON.stringify(verify.body?.checks));
  check('sum of all balances is ₹0.00 (money conserved)', verify.body?.sumOfAllBalances?.formatted === '₹0.00');

  console.log(`\n${failed === 0 ? '✅ ALL PASSED' : '❌ SOME CHECKS FAILED'}: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`\n❌ Smoke test crashed: ${err.message}`);
  if (err.cause?.code === 'ECONNREFUSED') console.error('   Is the server running? Start it with: npm run dev');
  process.exit(1);
});
