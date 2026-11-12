// Step 4 – registration and onboarding. New account holders start at PENDING_PROFILE; a valid (demo) profile and
// the current terms approve them automatically. Until then the API AND the database refuse accounts and money movement.
const crypto = require('crypto');
const { app, prisma, ownerDb, disconnectAll, request, newKey, createUser, TEST_PROFILE } = require('../helpers');
const { TERMS_VERSION } = require('../../src/config/onboarding');

afterAll(disconnectAll);

const submit = (holder, body = TEST_PROFILE) => request(app).post('/api/onboarding').set(holder.auth).send(body);
const status = async (holder) => (await prisma.user.findUnique({ where: { id: holder.user.id } })).onboardingStatus;
const DENIED = /permission denied/i;

describe('new registrations start at PENDING_PROFILE', () => {
  test('register → PENDING_PROFILE in the response, and GET /onboarding lists the rules the form must follow', async () => {
    const reg = await request(app).post('/api/auth/register').set('X-Auth-Mode', 'bearer')
      .send({ email: `onb-${crypto.randomUUID()}@test.local`, password: 'Secret123', fullName: 'New Customer' });
    expect(reg.status).toBe(201);
    expect(reg.body.user.onboardingStatus).toBe('PENDING_PROFILE');

    const res = await request(app).get('/api/onboarding').set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.onboarding).toMatchObject({ status: 'PENDING_PROFILE', profile: null, onboardedAt: null });
    expect(res.body.onboarding.requirements).toMatchObject({ termsVersion: TERMS_VERSION, minimumAge: 18 });
    expect(res.body.onboarding.requirements.states).toHaveLength(36);
    expect(res.body.onboarding.requirements.occupations).toContain('SALARIED');
  });
});

describe('until onboarding is approved: no accounts, no money movement', () => {
  test('opening an account → 403 ONBOARDING_INCOMPLETE, audited', async () => {
    const holder = await createUser('ACCOUNT_HOLDER', { onboarded: false });
    const res = await request(app).post('/api/accounts').set(holder.auth).send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ONBOARDING_INCOMPLETE');
    expect(await prisma.account.count({ where: { ownerId: holder.user.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { actorId: holder.user.id, action: 'ACCOUNT_CREATE', outcome: 'REFUSED', reason: 'ONBOARDING_INCOMPLETE' } })).toBe(1);
  });

  test.each([
    ['deposit', 'TXN_DEPOSIT', { accountId: crypto.randomUUID(), amountPaise: 100 }],
    ['withdraw', 'TXN_WITHDRAWAL', { accountId: crypto.randomUUID(), amountPaise: 100 }],
    ['transfer', 'TXN_TRANSFER', { fromAccountId: crypto.randomUUID(), toAccountId: crypto.randomUUID(), amountPaise: 100 }],
  ])('%s → 403 ONBOARDING_INCOMPLETE before validation, no idempotency key stored', async (path, action, body) => {
    const holder = await createUser('ACCOUNT_HOLDER', { onboarded: false });
    const res = await request(app).post(`/api/transactions/${path}`).set(holder.auth).set('Idempotency-Key', newKey()).send(body);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ONBOARDING_INCOMPLETE');
    expect(await prisma.idempotencyKey.count({ where: { userId: holder.user.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { actorId: holder.user.id, action, reason: 'ONBOARDING_INCOMPLETE' } })).toBe(1);
  });

  test('reading is still allowed (empty lists), so the dashboard works', async () => {
    const holder = await createUser('ACCOUNT_HOLDER', { onboarded: false });
    expect((await request(app).get('/api/accounts').set(holder.auth)).status).toBe(200);
    expect((await request(app).get('/api/transactions').set(holder.auth)).status).toBe(200);
  });
});

describe('a valid profile + terms → approved automatically', () => {
  test('approved at once; profile stored normalised; audit has no personal details; accounts and money work', async () => {
    const holder = await createUser('ACCOUNT_HOLDER', { onboarded: false });
    const res = await submit(holder, { ...TEST_PROFILE, phone: '+91 98765-43210', city: '  New   Delhi ', state: 'Delhi' });
    expect(res.status).toBe(200);
    expect(res.body.user.onboardingStatus).toBe('APPROVED');
    expect(res.body.onboarding).toMatchObject({
      status: 'APPROVED',
      termsAcceptedVersion: TERMS_VERSION,
      profile: { dateOfBirth: '1990-05-20', phone: '+919876543210', city: 'New Delhi', state: 'Delhi', pinCode: '560001', occupation: 'SALARIED' },
    });

    const entry = await prisma.auditLog.findFirst({ where: { actorId: holder.user.id, action: 'ONBOARDING_COMPLETE', outcome: 'SUCCESS' } });
    expect(entry.metadata).toEqual({ approval: 'AUTOMATIC', termsVersion: TERMS_VERSION });
    expect(JSON.stringify(entry)).not.toMatch(/9876543210|1990-05-20|560001|Delhi/);

    const account = await request(app).post('/api/accounts').set(holder.auth).send({});
    expect(account.status).toBe(201);
    const dep = await request(app).post('/api/transactions/deposit').set(holder.auth).set('Idempotency-Key', newKey())
      .send({ accountId: account.body.account.id, amountPaise: 50000 });
    expect(dep.status).toBe(201);
  });

  test('login and /me show the new status (the session does not need to be renewed)', async () => {
    const holder = await createUser('ACCOUNT_HOLDER', { onboarded: false });
    expect((await request(app).get('/api/auth/me').set(holder.auth)).body.user.onboardingStatus).toBe('PENDING_PROFILE');
    await submit(holder).expect(200);
    expect((await request(app).get('/api/auth/me').set(holder.auth)).body.user.onboardingStatus).toBe('APPROVED');
  });
});

describe('invalid submissions are refused and change nothing', () => {
  const eighteenYearsAgoPlusOneDay = (() => {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() - 18);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  test.each([
    ['under 18 (one day short)', { dateOfBirth: eighteenYearsAgoPlusOneDay }, 'dateOfBirth'],
    ['impossible date', { dateOfBirth: '2001-02-30' }, 'dateOfBirth'],
    ['born before 1900', { dateOfBirth: '1890-01-01' }, 'dateOfBirth'],
    ['not an Indian mobile number', { phone: '12345' }, 'phone'],
    ['mobile number starting with 5', { phone: '5876543210' }, 'phone'],
    ['PIN code starting with 0', { pinCode: '012345' }, 'pinCode'],
    ['unknown state', { state: 'Atlantis' }, 'state'],
    ['city with digits', { city: 'City 42' }, 'city'],
    ['unknown occupation', { occupation: 'ASTRONAUT' }, 'occupation'],
    ['terms not accepted', { acceptTerms: false }, 'acceptTerms'],
    ['outdated terms version', { termsVersion: '2020-01-01' }, 'termsVersion'],
  ])('%s → 400 on "%s"', async (_, override, field) => {
    const holder = await createUser('ACCOUNT_HOLDER', { onboarded: false });
    const res = await submit(holder, { ...TEST_PROFILE, ...override });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toContain(field);
    expect(await status(holder)).toBe('PENDING_PROFILE');
    expect(await prisma.customerProfile.count({ where: { userId: holder.user.id } })).toBe(0);
  });

  test('nobody can approve themselves: extra fields like onboardingStatus are rejected', async () => {
    const holder = await createUser('ACCOUNT_HOLDER', { onboarded: false });
    const res = await submit(holder, { ...TEST_PROFILE, onboardingStatus: 'APPROVED' });
    expect(res.status).toBe(400);
    expect(await status(holder)).toBe('PENDING_PROFILE');
  });
});

describe('only once, only account holders', () => {
  test('a second submission → 409 ONBOARDING_ALREADY_COMPLETE (audited); the first profile is kept', async () => {
    const holder = await createUser('ACCOUNT_HOLDER', { onboarded: false });
    await submit(holder).expect(200);
    const again = await submit(holder, { ...TEST_PROFILE, city: 'Mumbai' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ONBOARDING_ALREADY_COMPLETE');
    expect((await prisma.customerProfile.findUnique({ where: { userId: holder.user.id } })).city).toBe('Bengaluru');
    expect(await prisma.auditLog.count({ where: { actorId: holder.user.id, action: 'ONBOARDING_COMPLETE', outcome: 'REFUSED' } })).toBe(1);
  });

  test('5 submissions at the same moment → exactly one succeeds, one profile', async () => {
    const holder = await createUser('ACCOUNT_HOLDER', { onboarded: false });
    const results = await Promise.all(Array.from({ length: 5 }, () => submit(holder)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409, 409]);
    expect(await prisma.customerProfile.count({ where: { userId: holder.user.id } })).toBe(1);
  });

  test.each(['ADMIN', 'AUDITOR'])('%s cannot read or submit onboarding → 403', async (role) => {
    const staff = await createUser(role);
    expect((await request(app).get('/api/onboarding').set(staff.auth)).status).toBe(403);
    expect((await submit(staff)).status).toBe(403);
  });

  test('not signed in → 401', async () => {
    expect((await request(app).get('/api/onboarding')).status).toBe(401);
    expect((await request(app).post('/api/onboarding').send(TEST_PROFILE)).status).toBe(401);
  });

  test('GET /onboarding only ever shows the caller\'s own profile', async () => {
    const a = await createUser('ACCOUNT_HOLDER', { onboarded: false });
    const b = await createUser('ACCOUNT_HOLDER', { onboarded: false });
    await submit(a).expect(200);
    const res = await request(app).get('/api/onboarding').set(b.auth);
    expect(res.body.onboarding).toMatchObject({ status: 'PENDING_PROFILE', profile: null });
  });

  test('admins see the onboarding status in the user list', async () => {
    const admin = await createUser('ADMIN');
    const holder = await createUser('ACCOUNT_HOLDER', { onboarded: false });
    const res = await request(app).get('/api/admin/users').query({ q: holder.user.email }).set(admin.auth);
    expect(res.body.items[0]).toMatchObject({ email: holder.user.email, onboardingStatus: 'PENDING_PROFILE' });
  });
});

describe('the database enforces onboarding too (even as the API role, bypassing the API)', () => {
  test('approving an account holder without a profile → refused by trigger', async () => {
    const holder = await createUser('ACCOUNT_HOLDER', { onboarded: false });
    await expect(prisma.user.update({
      where: { id: holder.user.id },
      data: { onboardingStatus: 'APPROVED', onboardedAt: new Date(), termsVersion: TERMS_VERSION, termsAcceptedAt: new Date() },
    })).rejects.toThrow(/cannot be approved without a profile/);
  });

  test('a customer account for a holder who is not onboarded → refused by trigger', async () => {
    const holder = await createUser('ACCOUNT_HOLDER', { onboarded: false });
    await expect(prisma.account.create({ data: { accountNumber: `LL${String(Date.now()).slice(-10)}`, ownerId: holder.user.id, balance: 0n } }))
      .rejects.toThrow(/has not completed onboarding/);
  });

  test('APPROVED without a date (or a date without APPROVED) → refused by CHECK constraint', async () => {
    const staff = await createUser('AUDITOR');
    await expect(prisma.user.update({ where: { id: staff.user.id }, data: { onboardedAt: null } })).rejects.toThrow(/users_onboarding_consistent/);
  });

  test('a malformed phone number or PIN code → refused by CHECK constraints', async () => {
    const holder = await createUser('ACCOUNT_HOLDER', { onboarded: false });
    const base = { userId: holder.user.id, dateOfBirth: new Date('1990-01-01T00:00:00Z'), city: 'Pune', state: 'Maharashtra', occupation: 'OTHER' };
    await expect(prisma.customerProfile.create({ data: { ...base, phone: '12345', pinCode: '411001' } })).rejects.toThrow(/customer_profiles_phone_format/);
    await expect(prisma.customerProfile.create({ data: { ...base, phone: '+919876543210', pinCode: '0110' } })).rejects.toThrow(/customer_profiles_pin_format/);
  });

  test('the API role cannot change or delete a profile once written', async () => {
    await expect(prisma.$executeRawUnsafe('UPDATE customer_profiles SET city = city WHERE false')).rejects.toThrow(DENIED);
    await expect(prisma.$executeRawUnsafe('DELETE FROM customer_profiles WHERE false')).rejects.toThrow(DENIED);
  });
});

describe('users who existed before step 4 keep working', () => {
  test('an approved holder WITHOUT a profile (as the migration left existing users) can still open accounts and log in', async () => {
    // Recreate the state the migration's backfill produced: APPROVED, no profile, no terms.
    const legacy = await createUser('ACCOUNT_HOLDER', { onboarded: false });
    await ownerDb().$executeRawUnsafe('ALTER TABLE users DISABLE TRIGGER users_onboarding_requires_profile');
    try {
      await ownerDb().$executeRawUnsafe(`UPDATE users SET "onboardingStatus" = 'APPROVED', "onboardedAt" = now() WHERE id = '${legacy.user.id}'`);
    } finally {
      await ownerDb().$executeRawUnsafe('ALTER TABLE users ENABLE TRIGGER users_onboarding_requires_profile');
    }
    // Normal updates on such a user (here: logout → sessionVersion + 1) are not blocked by the trigger …
    await prisma.user.update({ where: { id: legacy.user.id }, data: { sessionVersion: { increment: 1 } } });
    const relogin = await request(app).post('/api/auth/login').set('X-Auth-Mode', 'bearer').send({ email: legacy.user.email, password: 'Secret123' });
    expect(relogin.status).toBe(200);
    expect(relogin.body.user.onboardingStatus).toBe('APPROVED');
    // … and accounts work as before.
    expect((await request(app).post('/api/accounts').set('Authorization', `Bearer ${relogin.body.token}`).send({})).status).toBe(201);
  });
});
