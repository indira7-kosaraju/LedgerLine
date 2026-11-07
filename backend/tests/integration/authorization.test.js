// Authorization: who may see and do what. Every refusal must leave money untouched.
const {
  app, prisma, request, createUser, createAccount, deposit, withdraw, transfer, balanceOf,
} = require('../helpers');
const { SYSTEM_ACCOUNT_NUMBER } = require('../../src/config/policy');

afterAll(() => prisma.$disconnect());

let asha, ravi, admin, auditor, ashaAcc, raviAcc, raviTxn, systemAcc;
beforeAll(async () => {
  [asha, ravi, admin, auditor] = await Promise.all([createUser(), createUser(), createUser('ADMIN'), createUser('AUDITOR')]);
  ashaAcc = await createAccount(asha);
  raviAcc = await createAccount(ravi);
  await deposit(asha, ashaAcc.id, 50000);
  raviTxn = (await deposit(ravi, raviAcc.id, 50000)).body.transaction;
  systemAcc = await prisma.account.findUnique({ where: { accountNumber: SYSTEM_ACCOUNT_NUMBER } });
});

describe("An account holder cannot touch another holder's account", () => {
  test.each([
    ['view account', () => request(app).get(`/api/accounts/${raviAcc.id}`)],
    ['view balance', () => request(app).get(`/api/accounts/${raviAcc.id}/balance`)],
    ['view statement', () => request(app).get(`/api/accounts/${raviAcc.id}/statement`)],
    ['view transaction', () => request(app).get(`/api/transactions/${raviTxn.id}`)],
  ])('%s → 403', async (_, req) => {
    expect((await req().set(asha.auth)).status).toBe(403);
  });

  test.each([
    ['deposit into it', () => deposit(asha, raviAcc.id, 100)],
    ['withdraw from it', () => withdraw(asha, raviAcc.id, 100)],
    ['transfer out of it', () => transfer(asha, raviAcc.id, ashaAcc.id, 100)],
  ])('%s → 403 NOT_OWNER, balances unchanged, refusal audited', async (_, act) => {
    const res = await act();
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_OWNER');
    expect(await balanceOf(raviAcc.id)).toBe(50000n);
    expect(await balanceOf(ashaAcc.id)).toBe(50000n);
  });

  test("filtering transactions by someone else's account shows nothing of theirs", async () => {
    const res = await request(app).get(`/api/transactions?accountId=${raviAcc.id}`).set(asha.auth);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  test('refusals were written to the audit log', async () => {
    expect(await prisma.auditLog.count({ where: { actorId: asha.user.id, outcome: 'REFUSED', reason: 'NOT_OWNER' } })).toBeGreaterThanOrEqual(6);
  });
});

describe('Role boundaries', () => {
  test.each(['/api/audit-logs', '/api/ledger/entries', '/api/ledger/verify', '/api/admin/users'])('account holder → %s → 403', async (path) => {
    expect((await request(app).get(path).set(asha.auth)).status).toBe(403);
  });

  test.each([
    ['deposit', (u) => deposit(u, ashaAcc.id, 100)],
    ['withdraw', (u) => withdraw(u, ashaAcc.id, 100)],
    ['transfer', (u) => transfer(u, ashaAcc.id, raviAcc.id, 100)],
    ['open account', (u) => request(app).post('/api/accounts').set(u.auth).send({})],
  ])('ADMIN and AUDITOR cannot %s (separation of duties)', async (_, act) => {
    expect((await act(admin)).status).toBe(403);
    expect((await act(auditor)).status).toBe(403);
    expect(await balanceOf(ashaAcc.id)).toBe(50000n);
  });

  test('AUDITOR is read-only: can read everything, change nothing', async () => {
    for (const path of ['/api/accounts', `/api/accounts/${raviAcc.id}/statement`, '/api/transactions', '/api/ledger/entries', '/api/ledger/verify', '/api/audit-logs']) {
      expect([path, (await request(app).get(path).set(auditor.auth)).status]).toEqual([path, 200]);
    }
    expect((await request(app).patch(`/api/accounts/${raviAcc.id}/status`).set(auditor.auth).send({ status: 'FROZEN' })).status).toBe(403);
    expect((await request(app).patch(`/api/admin/users/${ravi.user.id}/status`).set(auditor.auth).send({ isActive: false })).status).toBe(403);
    expect((await request(app).get('/api/admin/users').set(auditor.auth)).status).toBe(403);
  });

  test('ADMIN can manage accounts and users, but not their own status', async () => {
    expect((await request(app).get('/api/admin/users').set(admin.auth)).status).toBe(200);
    const self = await request(app).patch(`/api/admin/users/${admin.user.id}/status`).set(admin.auth).send({ isActive: false });
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe('CANNOT_CHANGE_OWN_STATUS');
  });

  test('every protected endpoint refuses anonymous requests with 401', async () => {
    for (const [method, path] of [['get', '/api/accounts'], ['post', '/api/accounts'], ['get', '/api/transactions'], ['post', '/api/transactions/deposit'], ['get', '/api/audit-logs'], ['get', '/api/ledger/verify'], ['get', '/api/admin/users']]) {
      expect([path, (await request(app)[method](path).send({})).status]).toEqual([path, 401]);
    }
  });
});

describe('The SYSTEM account is protected', () => {
  test('a holder cannot view it', async () => {
    expect((await request(app).get(`/api/accounts/${systemAcc.id}`).set(asha.auth)).status).toBe(403);
  });

  test('nobody can transfer into it (reported as "not found") or deposit "into" it', async () => {
    const before = await balanceOf(systemAcc.id);
    expect((await transfer(asha, ashaAcc.id, systemAcc.id, 100)).body.error.code).toBe('DESTINATION_NOT_FOUND');
    expect((await deposit(asha, systemAcc.id, 100)).status).toBeGreaterThanOrEqual(400);
    expect(await balanceOf(systemAcc.id)).toBe(before);
  });

  test('an admin cannot freeze or close it', async () => {
    expect((await request(app).patch(`/api/accounts/${systemAcc.id}/status`).set(admin.auth).send({ status: 'FROZEN' })).status).toBe(403);
  });
});
