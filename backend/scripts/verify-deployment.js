// Checks a DEPLOYED LedgerLine end to end, through the public frontend URL (so the
// Vercel → Render routing is tested too).
//
//   node scripts/verify-deployment.js https://your-app.vercel.app
//
// Uses only the public demo holders/auditor (DemoPass123) plus a fresh test user it registers
// itself. Moves simulated money only. Read-only for everything else.
const crypto = require('crypto');

const SITE = (process.argv[2] || process.env.DEPLOY_URL || '').replace(/\/+$/, '');
if (!SITE) {
  console.error('Usage: node scripts/verify-deployment.js https://your-app.vercel.app');
  process.exit(1);
}
const API = `${SITE}/api`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? `  (${detail})` : ''}`);
};

async function call(method, path, { token, body, key } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Mode': 'bearer',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(key && { 'Idempotency-Key': key }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    // no body
  }
  return { status: res.status, body: json, headers: res.headers };
}
const login = async (email, password = 'DemoPass123') => (await call('POST', '/auth/login', { body: { email, password } })).body?.token;
const balanceOf = async (token, id) => (await call('GET', `/accounts/${id}/balance`, { token })).body?.balance?.paise;

async function main() {
  console.log(`Verifying ${SITE}\n`);

  console.log('Frontend');
  const page = await fetch(SITE);
  const rehearsal = /^http:\/\/localhost[:/]/.test(`${SITE}/`); // local production rehearsal only
  check(rehearsal ? 'site loads (local rehearsal – HTTPS not expected)' : 'site loads over HTTPS', page.ok && (rehearsal || SITE.startsWith('https://')), `HTTP ${page.status}`);
  check('Content-Security-Policy header', /default-src 'self'/.test(page.headers.get('content-security-policy') || ''));
  const deepLink = await fetch(`${SITE}/accounts/some-id`);
  check('deep links are served by the React app (SPA fallback)', deepLink.ok && (await deepLink.text()).includes('<div id="root">'));

  console.log('\nBackend through the /api rewrite');
  const health = await call('GET', '/health');
  check('GET /api/health', health.status === 200 && health.body?.database === 'ok', JSON.stringify(health.body?.database));

  console.log('\nDemo credentials and roles');
  const asha = await login('asha.holder@example.com');
  const ravi = await login('ravi.holder@example.com');
  const auditor = await login('demo.auditor@example.com');
  check('demo holders and demo auditor can log in', Boolean(asha && ravi && auditor));
  // Its password is published in README.md – on a public site it must be deactivated (npm run admin:bootstrap -- --replace-demo-admin).
  check('public demo admin cannot log in (401)', (await call('POST', '/auth/login', { body: { email: 'demo.admin@example.com', password: 'DemoPass123' } })).status === 401);
  const cookieLogin = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'asha.holder@example.com', password: 'DemoPass123' }) });
  const setCookie = cookieLogin.headers.get('set-cookie') || '';
  check('browser login sets an HttpOnly, Secure, SameSite=Strict cookie', /HttpOnly/i.test(setCookie) && /Secure/i.test(setCookie) && /SameSite=Strict/i.test(setCookie));
  check('holder cannot read the ledger (403)', (await call('GET', '/ledger/entries', { token: asha })).status === 403);
  check('holder cannot open the admin overview or staff list (403)', (await call('GET', '/admin/overview', { token: asha })).status === 403 && (await call('GET', '/admin/staff', { token: asha })).status === 403);
  check('auditor cannot move money (403)', (await call('POST', '/transactions/deposit', { token: auditor, key: crypto.randomUUID(), body: { accountId: crypto.randomUUID(), amountPaise: 100 } })).status === 403);

  console.log('\nMoney movement (fresh test user)');
  const email = `deploy-check-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const reg = await call('POST', '/auth/register', { body: { email, password: 'Verify2026Ok' /* must not contain the email name (step 6 rule) */, fullName: 'Deployment Check' } });
  check('register', reg.status === 201);
  const me = reg.body?.token;
  // Onboarding (step 4): no account before it, approved automatically with a valid (demo) profile and the current terms.
  check('account refused before onboarding (403)', (await call('POST', '/accounts', { token: me, body: {} })).body?.error?.code === 'ONBOARDING_INCOMPLETE');
  const termsVersion = (await call('GET', '/onboarding', { token: me })).body?.onboarding?.requirements?.termsVersion;
  const onboard = await call('POST', '/onboarding', { token: me, body: { dateOfBirth: '1990-01-01', phone: '9000000000', city: 'Demo City', state: 'Karnataka', pinCode: '560001', occupation: 'OTHER', acceptTerms: true, termsVersion } });
  check('onboarding approved automatically', onboard.status === 200 && onboard.body?.user?.onboardingStatus === 'APPROVED');
  const a = (await call('POST', '/accounts', { token: me, body: {} })).body?.account;
  const b = (await call('POST', '/accounts', { token: me, body: {} })).body?.account;
  check('open two accounts', Boolean(a && b));
  check('deposit ₹1,000', (await call('POST', '/transactions/deposit', { token: me, key: crypto.randomUUID(), body: { accountId: a.id, amountPaise: 100000 } })).status === 201);
  check('withdraw ₹100', (await call('POST', '/transactions/withdraw', { token: me, key: crypto.randomUUID(), body: { accountId: a.id, amountPaise: 10000 } })).status === 201);
  check('transfer ₹100 to own account', (await call('POST', '/transactions/transfer', { token: me, key: crypto.randomUUID(), body: { fromAccountId: a.id, toAccountId: b.id, amountPaise: 10000 } })).status === 201);
  check('balances: ₹800 and ₹100', (await balanceOf(me, a.id)) === '80000' && (await balanceOf(me, b.id)) === '10000');
  const history = await call('GET', '/transactions', { token: me });
  check('transaction history shows 3', history.body?.total === 3);
  check('insufficient balance refused (422)', (await call('POST', '/transactions/withdraw', { token: me, key: crypto.randomUUID(), body: { accountId: a.id, amountPaise: 99999 } })).body?.error?.code === 'INSUFFICIENT_FUNDS');

  console.log('\nIdempotency');
  const key = crypto.randomUUID();
  const first = await call('POST', '/transactions/transfer', { token: me, key, body: { fromAccountId: a.id, toAccountId: b.id, amountPaise: 5000 } });
  const retry = await call('POST', '/transactions/transfer', { token: me, key, body: { fromAccountId: a.id, toAccountId: b.id, amountPaise: 5000 } });
  check('same key twice → same transaction, replayed', retry.status === 201 && retry.body?.transaction?.id === first.body?.transaction?.id && retry.headers.get('idempotent-replayed') === 'true');
  const burst = await Promise.all(Array.from({ length: 5 }, () => call('POST', '/transactions/transfer', { token: me, key, body: { fromAccountId: a.id, toAccountId: b.id, amountPaise: 5000 } })));
  check('5 more identical requests at once → no new transaction', burst.every((r) => r.body?.transaction?.id === first.body?.transaction?.id));
  check('money moved once (₹750 / ₹150)', (await balanceOf(me, a.id)) === '75000' && (await balanceOf(me, b.id)) === '15000');
  const reused = await call('POST', '/transactions/transfer', { token: me, key, body: { fromAccountId: a.id, toAccountId: b.id, amountPaise: 9999 } });
  check('same key, different amount → 422', reused.body?.error?.code === 'IDEMPOTENCY_KEY_REUSED');

  console.log('\nConcurrency (balance ₹1,000; ₹800 + ₹700 at the same moment)');
  const c = (await call('POST', '/accounts', { token: me, body: {} })).body?.account;
  await call('POST', '/transactions/deposit', { token: me, key: crypto.randomUUID(), body: { accountId: c.id, amountPaise: 100000 } });
  const race = await Promise.all([
    call('POST', '/transactions/withdraw', { token: me, key: crypto.randomUUID(), body: { accountId: c.id, amountPaise: 80000 } }),
    call('POST', '/transactions/withdraw', { token: me, key: crypto.randomUUID(), body: { accountId: c.id, amountPaise: 70000 } }),
  ]);
  const statuses = race.map((r) => r.status).sort();
  check('exactly one succeeds, the other is refused', statuses[0] === 201 && statuses[1] === 422, statuses.join(' + '));
  const left = await balanceOf(me, c.id);
  check('balance never negative (₹200 or ₹300 left)', left === '20000' || left === '30000', `${Number(left) / 100} rupees`);

  console.log('\nLedger');
  const verify = await call('GET', '/ledger/verify', { token: auditor });
  check('ledger verifies (auditor)', verify.body?.ok === true, JSON.stringify(verify.body?.checks));
  check('all balances sum to ₹0', verify.body?.sumOfAllBalances?.paise === '0');
  const auditTrail = await call('GET', '/audit-logs/verify', { token: auditor });
  check('audit trail hash chain verifies (auditor)', auditTrail.status === 200 && auditTrail.body?.ok === true, `${auditTrail.body?.records} records, head #${auditTrail.body?.head?.chainSeq}`);

  const failed = results.filter((ok) => !ok).length;
  console.log(failed ? `\n❌ ${failed} of ${results.length} checks FAILED` : `\n✅ Deployment verified: ${results.length} checks passed`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(`\n❌ Verification crashed: ${err.message}`);
  process.exitCode = 1;
});
