// Step 5 – admin dashboard, user management and staff management.
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { app, prisma, disconnectAll, request, createUser, createAccount, deposit, toJson } = require('../helpers');

afterAll(disconnectAll);

const PASSWORD = 'Secret123'; // helpers.createUser
const as = (u) => ({ ...u.auth, 'X-Auth-Mode': 'bearer' });
const staffEmail = () => `staff-${crypto.randomUUID().slice(0, 8)}@test.local`;
const createStaff = (admin, body) => request(app).post('/api/admin/staff').set(as(admin)).send({ currentPassword: PASSWORD, ...body });
const changeRole = (admin, id, body) => request(app).patch(`/api/admin/staff/${id}/role`).set(as(admin)).send({ currentPassword: PASSWORD, ...body });
const setStatus = (admin, id, body) => request(app).patch(`/api/admin/users/${id}/status`).set(as(admin)).send(body);
const auditCount = (where) => prisma.auditLog.count({ where });

describe('admin overview', () => {
  test('ADMIN gets figures computed by the database – no personal details', async () => {
    const admin = await createUser('ADMIN');
    const res = await request(app).get('/api/admin/overview').set(admin.auth);
    expect(res.status).toBe(200);
    const [users, holders, pending, customerAccounts] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'ACCOUNT_HOLDER', isActive: true } }),
      prisma.user.count({ where: { role: 'ACCOUNT_HOLDER', onboardingStatus: 'PENDING_PROFILE' } }),
      prisma.account.count({ where: { type: 'CUSTOMER' } }),
    ]);
    expect(res.body.users).toMatchObject({ total: users, pendingOnboarding: pending });
    expect(res.body.users.byRole.ACCOUNT_HOLDER.active).toBe(holders);
    expect(res.body.accounts.total).toBe(customerAccounts);
    expect(res.body.customerFunds).toHaveProperty('formatted');
    expect(Array.isArray(res.body.recentAdminActions)).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|sessionVersion|\+91\d{10}|dateOfBirth|pinCode/);
  });

  test.each(['AUDITOR', 'ACCOUNT_HOLDER'])('%s → 403, audited as AUTHZ_DENIED', async (role) => {
    const user = await createUser(role);
    expect((await request(app).get('/api/admin/overview').set(user.auth)).status).toBe(403);
    expect(await auditCount({ actorId: user.user.id, action: 'AUTHZ_DENIED' })).toBe(1);
  });
});

describe('user management', () => {
  test('search by onboarding status', async () => {
    const admin = await createUser('ADMIN');
    const pending = await createUser('ACCOUNT_HOLDER', { onboarded: false });
    const res = await request(app).get('/api/admin/users').query({ onboarding: 'PENDING_PROFILE', q: pending.user.email }).set(admin.auth);
    expect(res.body.items.map((u) => u.id)).toEqual([pending.user.id]);
    const none = await request(app).get('/api/admin/users').query({ onboarding: 'APPROVED', q: pending.user.email }).set(admin.auth);
    expect(none.body.total).toBe(0);
  });

  test('user details: accounts and activity, personal data minimised (masked phone, age only, no PIN)', async () => {
    const admin = await createUser('ADMIN');
    const holder = await createUser();
    const account = await createAccount(holder);
    await deposit(holder, account.id, 25000).expect(201);
    await request(app).post('/api/auth/login').send({ email: holder.user.email, password: PASSWORD }).expect(200);

    const res = await request(app).get(`/api/admin/users/${holder.user.id}`).set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: holder.user.id, role: 'ACCOUNT_HOLDER' });
    expect(res.body.profile).toEqual({ age: expect.any(Number), phone: '+91 ••••••3210', city: 'Bengaluru', state: 'Karnataka', occupation: 'SALARIED' });
    expect(res.body.accounts).toMatchObject({ total: 1, active: 1, frozen: 0, closed: 0, totalBalance: { paise: '25000' } });
    expect(res.body.activity).toMatchObject({ transactions: 1, lastLoginAt: expect.any(String) });
    expect(JSON.stringify(res.body)).not.toMatch(/9876543210|1990-05-20|560001|passwordHash|sessionVersion/);
  });

  test('unknown user → 404; auditor → 403', async () => {
    const admin = await createUser('ADMIN');
    const auditor = await createUser('AUDITOR');
    expect((await request(app).get(`/api/admin/users/${crypto.randomUUID()}`).set(admin.auth)).status).toBe(404);
    expect((await request(app).get(`/api/admin/users/${admin.user.id}`).set(auditor.auth)).status).toBe(403);
  });

  test('deactivate with a reason: sessions end at once; the reason is in the audit log; a repeat → 409 STATUS_UNCHANGED', async () => {
    const admin = await createUser('ADMIN');
    const holder = await createUser();
    const res = await setStatus(admin, holder.user.id, { isActive: false, reason: 'Suspicious activity reported' });
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(holder.auth)).status).toBe(401);
    const entry = await prisma.auditLog.findFirst({ where: { action: 'USER_SET_STATUS', entityId: holder.user.id, outcome: 'SUCCESS' } });
    expect(entry.metadata).toEqual({ from: true, to: false, role: 'ACCOUNT_HOLDER', note: 'Suspicious activity reported' });
    const again = await setStatus(admin, holder.user.id, { isActive: false });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('STATUS_UNCHANGED');
  });

  test('"sign out everywhere": every old token stops working, the user stays active; not for oneself', async () => {
    const admin = await createUser('ADMIN');
    const holder = await createUser();
    const res = await request(app).post(`/api/admin/users/${holder.user.id}/revoke-sessions`).set(as(admin)).send({ reason: 'Lost phone' });
    expect(res.status).toBe(200);
    expect(res.body.user.isActive).toBe(true);
    expect((await request(app).get('/api/auth/me').set(holder.auth)).status).toBe(401);
    expect(await auditCount({ action: 'USER_REVOKE_SESSIONS', entityId: holder.user.id, outcome: 'SUCCESS' })).toBe(1);

    const self = await request(app).post(`/api/admin/users/${admin.user.id}/revoke-sessions`).set(as(admin)).send({});
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe('CANNOT_REVOKE_OWN_SESSIONS');
  });

  test('two admins deactivating EACH OTHER at the same moment → exactly one succeeds', async () => {
    const a = await createUser('ADMIN');
    const b = await createUser('ADMIN');
    const [ra, rb] = await Promise.all([setStatus(a, b.user.id, { isActive: false }), setStatus(b, a.user.id, { isActive: false })]);
    // The loser is refused either inside the lock (403 ACTOR_NOT_AUTHORIZED) or – if its request only starts
    // after the other one committed – already when signing in the request (401). Never both succeed.
    const statuses = [ra.status, rb.status].sort((x, y) => x - y);
    expect(statuses[0]).toBe(200);
    expect([401, 403]).toContain(statuses[1]);
    expect(await prisma.user.count({ where: { id: { in: [a.user.id, b.user.id] }, isActive: true } })).toBe(1);
  });

  test('holders and auditors cannot change anyone\'s status (403), and nothing changes', async () => {
    const holder = await createUser();
    const auditor = await createUser('AUDITOR');
    const victim = await createUser();
    for (const u of [holder, auditor]) {
      expect((await setStatus(u, victim.user.id, { isActive: false })).status).toBe(403);
      expect((await request(app).post(`/api/admin/users/${victim.user.id}/revoke-sessions`).set(as(u)).send({})).status).toBe(403);
    }
    expect((await prisma.user.findUnique({ where: { id: victim.user.id } })).isActive).toBe(true);
  });
});

describe('staff management – creating staff', () => {
  test('creates an AUDITOR with a temporary password shown ONCE; never stored in plain text or logged', async () => {
    const admin = await createUser('ADMIN');
    const email = staffEmail();
    const res = await createStaff(admin, { email, fullName: 'New Auditor', role: 'AUDITOR' });
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.user).toMatchObject({ email, role: 'AUDITOR', mustChangePassword: true, onboardingStatus: 'APPROVED', isActive: true });
    const { temporaryPassword } = res.body;
    expect(temporaryPassword).toMatch(/^[A-Za-z0-9]{20}$/);

    const stored = await prisma.user.findUnique({ where: { email } });
    expect(stored.passwordHash).not.toContain(temporaryPassword);
    expect(await bcrypt.compare(temporaryPassword, stored.passwordHash)).toBe(true);
    const entries = await prisma.auditLog.findMany({ where: { action: 'STAFF_CREATE', entityId: stored.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0].metadata).toEqual({ email, role: 'AUDITOR' });
    expect(toJson(entries)).not.toContain(temporaryPassword);
  });

  test('the new staff member must change the temporary password before doing anything else', async () => {
    const admin = await createUser('ADMIN');
    const email = staffEmail();
    const { temporaryPassword } = (await createStaff(admin, { email, fullName: 'Temp Auditor', role: 'AUDITOR' })).body;

    const login = await request(app).post('/api/auth/login').set('X-Auth-Mode', 'bearer').send({ email, password: temporaryPassword });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
    const auth = { Authorization: `Bearer ${login.body.token}` };

    for (const path of ['/api/audit-logs', '/api/accounts', '/api/ledger/verify']) {
      const blocked = await request(app).get(path).set(auth);
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    }
    expect((await request(app).get('/api/auth/me').set(auth)).status).toBe(200);

    const changed = await request(app).post('/api/auth/change-password').set(auth).set('X-Auth-Mode', 'bearer')
      .send({ currentPassword: temporaryPassword, newPassword: 'MyOwnPass456' });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
    expect((await request(app).get('/api/audit-logs').set('Authorization', `Bearer ${changed.body.token}`)).status).toBe(200);
  });

  test('the admin\'s own password is required – a wrong one → 400, nobody created, refusal audited', async () => {
    const admin = await createUser('ADMIN');
    const email = staffEmail();
    const res = await createStaff(admin, { email, fullName: 'Nope', role: 'ADMIN', currentPassword: 'WrongPass1' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    expect(await prisma.user.count({ where: { email } })).toBe(0);
    expect(await auditCount({ actorId: admin.user.id, action: 'STAFF_CREATE', outcome: 'REFUSED', reason: 'WRONG_PASSWORD' })).toBe(1);
  });

  test.each([
    ['role ACCOUNT_HOLDER', { role: 'ACCOUNT_HOLDER' }],
    ['unknown role', { role: 'SUPERUSER' }],
    ['extra field (isActive)', { role: 'AUDITOR', isActive: false }],
    ['extra field (mustChangePassword: false)', { role: 'ADMIN', mustChangePassword: false }],
    ['missing password confirmation', { role: 'AUDITOR', currentPassword: '' }],
  ])('%s → 400, nobody created', async (_, override) => {
    const admin = await createUser('ADMIN');
    const email = staffEmail();
    expect((await createStaff(admin, { email, fullName: 'Bad Input', ...override })).status).toBe(400);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  test('an existing user is never turned into staff → 409 EMAIL_TAKEN', async () => {
    const admin = await createUser('ADMIN');
    const holder = await createUser();
    const res = await createStaff(admin, { email: holder.user.email, fullName: 'Takeover', role: 'ADMIN' });
    expect(res.status).toBe(409);
    expect((await prisma.user.findUnique({ where: { id: holder.user.id } })).role).toBe('ACCOUNT_HOLDER');
  });

  test.each(['AUDITOR', 'ACCOUNT_HOLDER'])('%s cannot create staff or list staff (403)', async (role) => {
    const user = await createUser(role);
    const email = staffEmail();
    expect((await createStaff(user, { email, fullName: 'Escalation', role: 'ADMIN' })).status).toBe(403);
    expect((await request(app).get('/api/admin/staff').set(user.auth)).status).toBe(403);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });
});

describe('staff management – changing roles', () => {
  test('AUDITOR → ADMIN with the admin\'s password: role changed, their sessions end, audited from/to', async () => {
    const admin = await createUser('ADMIN');
    const auditor = await createUser('AUDITOR');
    const res = await changeRole(admin, auditor.user.id, { role: 'ADMIN', reason: 'Team lead' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('ADMIN');
    expect((await request(app).get('/api/auth/me').set(auditor.auth)).status).toBe(401); // old token revoked
    const entry = await prisma.auditLog.findFirst({ where: { action: 'USER_CHANGE_ROLE', entityId: auditor.user.id, outcome: 'SUCCESS' } });
    expect(entry.metadata).toEqual({ from: 'AUDITOR', to: 'ADMIN', note: 'Team lead' });
  });

  test('an account holder can never be promoted → 400 ROLE_CHANGE_NOT_ALLOWED, role unchanged', async () => {
    const admin = await createUser('ADMIN');
    const holder = await createUser();
    const res = await changeRole(admin, holder.user.id, { role: 'ADMIN' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ROLE_CHANGE_NOT_ALLOWED');
    expect((await prisma.user.findUnique({ where: { id: holder.user.id } })).role).toBe('ACCOUNT_HOLDER');
  });

  test('nobody changes their own role; same role → 409; wrong password → 400; to ACCOUNT_HOLDER → 400', async () => {
    const admin = await createUser('ADMIN');
    const auditor = await createUser('AUDITOR');
    expect((await changeRole(admin, admin.user.id, { role: 'AUDITOR' })).body.error.code).toBe('CANNOT_CHANGE_OWN_ROLE');
    expect((await changeRole(admin, auditor.user.id, { role: 'AUDITOR' })).body.error.code).toBe('ROLE_UNCHANGED');
    expect((await changeRole(admin, auditor.user.id, { role: 'ADMIN', currentPassword: 'WrongPass1' })).body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    expect((await changeRole(admin, auditor.user.id, { role: 'ACCOUNT_HOLDER' })).status).toBe(400);
    expect((await prisma.user.findUnique({ where: { id: auditor.user.id } })).role).toBe('AUDITOR');
  });

  test('an auditor cannot promote themselves or anyone (403)', async () => {
    const auditor = await createUser('AUDITOR');
    const other = await createUser('AUDITOR');
    expect((await changeRole(auditor, auditor.user.id, { role: 'ADMIN' })).status).toBe(403);
    expect((await changeRole(auditor, other.user.id, { role: 'ADMIN' })).status).toBe(403);
  });
});

describe('the database enforces the role rules too (as the API role, bypassing the API)', () => {
  test('an account holder cannot be turned into staff, nor staff into a holder → trigger', async () => {
    const holder = await createUser();
    const auditor = await createUser('AUDITOR');
    await expect(prisma.user.update({ where: { id: holder.user.id }, data: { role: 'ADMIN' } })).rejects.toThrow(/account holders and staff are separate/);
    await expect(prisma.user.update({ where: { id: auditor.user.id }, data: { role: 'ACCOUNT_HOLDER' } })).rejects.toThrow(/account holders and staff are separate/);
  });

  test('staff cannot own a customer account → trigger', async () => {
    const admin = await createUser('ADMIN');
    await expect(prisma.account.create({ data: { accountNumber: `LL${String(Date.now()).slice(-10)}`, ownerId: admin.user.id, balance: 0n } }))
      .rejects.toThrow(/staff cannot own customer accounts/);
  });

  test('a transaction that leaves NO active admin is refused at commit (and rolled back)', async () => {
    const ids = (await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } })).map((u) => u.id);
    expect(ids.length).toBeGreaterThan(0);
    try {
      await expect(prisma.$transaction((tx) => tx.user.updateMany({ where: { id: { in: ids } }, data: { isActive: false } })))
        .rejects.toThrow(/At least one active administrator must remain/);
      expect(await prisma.user.count({ where: { id: { in: ids }, isActive: true } })).toBe(ids.length);
    } finally {
      // If the protection is ever broken, the update above really happens – put the admins back so the
      // test database (and the browser tests' seeded admin) stay usable. (Found in a mutation run.)
      await prisma.user.updateMany({ where: { id: { in: ids } }, data: { isActive: true } });
    }
  });

  test('…but replacing one admin with another inside one transaction is fine (checked at commit)', async () => {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } });
    const ids = admins.map((a) => a.id);
    try {
      await prisma.$transaction(async (tx) => {
        await tx.user.updateMany({ where: { id: { in: ids } }, data: { isActive: false } });
        await tx.user.create({ data: { email: staffEmail(), fullName: 'Replacement Admin', passwordHash: bcrypt.hashSync(crypto.randomUUID(), 4), role: 'ADMIN', onboardingStatus: 'APPROVED', onboardedAt: new Date() } });
      });
    } finally {
      await prisma.user.updateMany({ where: { id: { in: ids } }, data: { isActive: true } });
    }
    expect(await prisma.user.count({ where: { id: { in: ids }, isActive: true } })).toBe(ids.length);
  });

  test('the role guard cannot be switched off by the API role', async () => {
    // (only the table owner could – its password never leaves the operator's computer)
    await expect(prisma.$executeRawUnsafe('ALTER TABLE users DISABLE TRIGGER users_role_transition')).rejects.toThrow(/must be owner|permission denied/);
    await expect(prisma.$executeRawUnsafe('ALTER TABLE users DISABLE TRIGGER users_keep_one_active_admin')).rejects.toThrow(/must be owner|permission denied/);
  });
});
