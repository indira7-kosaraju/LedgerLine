// Account management API: creation rules, the per-user limit, listing, balance, status changes.
const { app, prisma, request, createUser, createAccount, deposit, balanceOf } = require('../helpers');

afterAll(() => prisma.$disconnect());

describe('Opening accounts', () => {
  test('a new account starts at ₹0, belongs to the caller, has an LL number', async () => {
    const holder = await createUser();
    const res = await request(app).post('/api/accounts').set(holder.auth).send({});
    expect(res.status).toBe(201);
    expect(res.body.account).toMatchObject({ type: 'CUSTOMER', status: 'ACTIVE', ownerId: holder.user.id, balance: { paise: '0', formatted: '₹0.00' } });
    expect(res.body.account.accountNumber).toMatch(/^LL\d{10}$/);
  });

  test('clients cannot set balance or owner (unknown fields rejected)', async () => {
    const holder = await createUser();
    const other = await createUser();
    const res = await request(app).post('/api/accounts').set(holder.auth).send({ balance: 999999, ownerId: other.user.id });
    expect(res.status).toBe(400);
    expect(await prisma.account.count({ where: { ownerId: { in: [holder.user.id, other.user.id] } } })).toBe(0);
  });

  test('the 6th account is refused (409) and audited', async () => {
    const holder = await createUser();
    for (let i = 0; i < 5; i++) await createAccount(holder);
    const res = await request(app).post('/api/accounts').set(holder.auth).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACCOUNT_LIMIT_REACHED');
    expect(await prisma.auditLog.count({ where: { actorId: holder.user.id, reason: 'ACCOUNT_LIMIT_REACHED' } })).toBe(1);
  });

  test('10 simultaneous "open account" requests never create more than 5 accounts', async () => {
    const holder = await createUser();
    const results = await Promise.all(Array.from({ length: 10 }, () => request(app).post('/api/accounts').set(holder.auth).send({})));
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await prisma.account.count({ where: { ownerId: holder.user.id } })).toBe(5);
  });
});

describe('Listing and reading', () => {
  test('a holder lists only their own accounts – even when filtering by someone else', async () => {
    const holder = await createUser();
    const other = await createUser();
    await createAccount(holder);
    await createAccount(other);
    const res = await request(app).get(`/api/accounts?ownerId=${other.user.id}&q=${encodeURIComponent(other.user.email)}`).set(holder.auth);
    expect(res.status).toBe(200);
    expect(res.body.items.every((a) => a.ownerId === holder.user.id)).toBe(true);
  });

  test('total balance comes from the server and matches the accounts', async () => {
    const holder = await createUser();
    const a = await createAccount(holder);
    const b = await createAccount(holder);
    await deposit(holder, a.id, 12345);
    await deposit(holder, b.id, 55);
    const res = await request(app).get('/api/accounts').set(holder.auth);
    expect(res.body.summary.totalBalance).toEqual({ paise: '12400', formatted: '₹124.00', currency: 'INR' });
  });

  test('balance and statement agree with the ledger', async () => {
    const holder = await createUser();
    const account = await createAccount(holder);
    await deposit(holder, account.id, 70000);
    const balance = await request(app).get(`/api/accounts/${account.id}/balance`).set(holder.auth);
    const statement = await request(app).get(`/api/accounts/${account.id}/statement`).set(holder.auth);
    expect(balance.body.balance.paise).toBe('70000');
    expect(statement.body.summary.balanceMatchesLedger).toBe(true);
    expect(statement.body.entries).toHaveLength(1);
  });

  test('unknown account → 404, malformed id → 400', async () => {
    const holder = await createUser();
    expect((await request(app).get('/api/accounts/00000000-0000-4000-8000-000000000000').set(holder.auth)).status).toBe(404);
    expect((await request(app).get('/api/accounts/not-a-uuid').set(holder.auth)).status).toBe(400);
  });
});

describe('Admin status changes', () => {
  let admin, holder, account;
  beforeAll(async () => {
    admin = await createUser('ADMIN');
    holder = await createUser();
    account = await createAccount(holder);
    await deposit(holder, account.id, 1000);
  });

  test('freeze → money cannot move; unfreeze → it can again', async () => {
    expect((await request(app).patch(`/api/accounts/${account.id}/status`).set(admin.auth).send({ status: 'FROZEN', reason: 'test' })).status).toBe(200);
    const blocked = await deposit(holder, account.id, 100);
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe('ACCOUNT_NOT_ACTIVE');
    expect((await request(app).patch(`/api/accounts/${account.id}/status`).set(admin.auth).send({ status: 'ACTIVE' })).status).toBe(200);
    expect((await deposit(holder, account.id, 100)).status).toBe(201);
  });

  test('closing an account with money in it is refused', async () => {
    const res = await request(app).patch(`/api/accounts/${account.id}/status`).set(admin.auth).send({ status: 'CLOSED' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BALANCE_NOT_ZERO');
    expect(await balanceOf(account.id)).toBe(1100n);
  });

  test('a closed account can never be reopened', async () => {
    const empty = await createAccount(holder);
    expect((await request(app).patch(`/api/accounts/${empty.id}/status`).set(admin.auth).send({ status: 'CLOSED' })).status).toBe(200);
    const res = await request(app).patch(`/api/accounts/${empty.id}/status`).set(admin.auth).send({ status: 'ACTIVE' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACCOUNT_CLOSED');
  });
});
