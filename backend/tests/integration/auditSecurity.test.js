// Step 6 – audit integrity (hash chain), sensitive-data protection in the audit trail, security events,
// password rules, audit log filters.
const crypto = require('crypto');
const { app, prisma, ownerDb, disconnectAll, request, createUser } = require('../helpers');
const audit = require('../../src/services/audit.service');

afterAll(disconnectAll);

const problems = (client = prisma) => client.$queryRaw`SELECT "chainSeq", problem FROM audit_chain_problems(20)`;
const latest = (n) => prisma.auditLog.findMany({ orderBy: { chainSeq: 'desc' }, take: n });
const marker = () => `t-${crypto.randomUUID().slice(0, 8)}`;

// Runs `fn` as the table OWNER inside a transaction that is ALWAYS rolled back – tampering never sticks.
async function asOwnerThenRollback(fn) {
  let result;
  await ownerDb().$transaction(async (tx) => {
    await tx.$executeRawUnsafe('ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_append_only');
    result = await fn(tx);
    throw new Error('ROLLBACK');
  }).catch((err) => {
    if (err.message !== 'ROLLBACK') throw err;
  });
  return result;
}

describe('hash chain', () => {
  test('every new record follows the previous one: next sequence number, links to its hash', async () => {
    const m = marker();
    for (let i = 0; i < 3; i++) await audit.record({ action: 'TEST_CHAIN', outcome: 'SUCCESS', reason: m });
    const [c, b, a] = await latest(3);
    expect(b.chainSeq).toBe(a.chainSeq + 1n);
    expect(c.chainSeq).toBe(b.chainSeq + 1n);
    expect(b.prevHash).toBe(a.hash);
    expect(c.prevHash).toBe(b.hash);
    expect(c.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await problems()).toEqual([]);
  });

  test('the API cannot choose the chain values – the database overwrites them', async () => {
    const [before] = await latest(1);
    const row = await prisma.auditLog.create({
      data: { action: 'TEST_CHAIN', outcome: 'SUCCESS', chainSeq: 1n, prevHash: 'forged', hash: 'forged' },
    });
    expect(row.chainSeq).toBe(before.chainSeq + 1n);
    expect(row.prevHash).toBe(before.hash);
    expect(row.hash).not.toBe('forged');
  });

  test('40 records written at the same moment → one gapless chain, no problems', async () => {
    const [before] = await latest(1);
    const m = marker();
    await Promise.all(Array.from({ length: 40 }, () => audit.recordSafe({ action: 'TEST_CHAIN', outcome: 'SUCCESS', reason: m })));
    const rows = await prisma.auditLog.findMany({ where: { reason: m }, orderBy: { chainSeq: 'asc' } });
    expect(rows).toHaveLength(40);
    const seqs = await prisma.auditLog.findMany({ where: { chainSeq: { gt: before.chainSeq } }, select: { chainSeq: true }, orderBy: { chainSeq: 'asc' } });
    seqs.forEach((r, i) => expect(r.chainSeq).toBe(before.chainSeq + BigInt(i + 1)));
    expect(await problems()).toEqual([]);
  });

  test('a record edited afterwards (owner, append-only trigger off) → "content changed" at exactly that record', async () => {
    const row = await audit.record({ action: 'TEST_CHAIN', outcome: 'REFUSED', reason: marker(), metadata: { amount: 100 } });
    const found = await asOwnerThenRollback(async (tx) => {
      await tx.$executeRaw`UPDATE audit_logs SET outcome = 'SUCCESS', metadata = '{"amount": 1}' WHERE id = ${row.id}::uuid`;
      return problems(tx);
    });
    expect(found).toEqual([{ chainSeq: row.chainSeq, problem: 'content changed after it was written' }]);
    expect(await problems()).toEqual([]); // rolled back
  });

  test('a record removed → "records missing" at the next one', async () => {
    const first = await audit.record({ action: 'TEST_CHAIN', outcome: 'SUCCESS', reason: marker() });
    await audit.record({ action: 'TEST_CHAIN', outcome: 'SUCCESS', reason: marker() });
    const found = await asOwnerThenRollback(async (tx) => {
      await tx.$executeRaw`DELETE FROM audit_logs WHERE id = ${first.id}::uuid`;
      return problems(tx);
    });
    expect(found).toEqual([{ chainSeq: first.chainSeq + 1n, problem: 'records missing before this one (gap in the sequence)' }]);
  });

  test('a record rewritten WITH a fresh hash (to hide the edit) → the next record no longer links to it', async () => {
    const a = await audit.record({ action: 'TEST_CHAIN', outcome: 'REFUSED', reason: marker() });
    await audit.record({ action: 'TEST_CHAIN', outcome: 'SUCCESS', reason: marker() });
    const found = await asOwnerThenRollback(async (tx) => {
      await tx.$executeRaw`UPDATE audit_logs SET outcome = 'SUCCESS' WHERE id = ${a.id}::uuid`;
      await tx.$executeRaw`UPDATE audit_logs SET hash = audit_row_hash("prevHash", "chainSeq", audit_logs) WHERE id = ${a.id}::uuid`;
      return problems(tx);
    });
    expect(found).toEqual([{ chainSeq: a.chainSeq + 1n, problem: 'does not link to the previous record' }]);
  });

  test('the API role cannot switch off the chain or the append-only protection', async () => {
    for (const trigger of ['audit_logs_chain', 'audit_logs_append_only']) {
      await expect(prisma.$executeRawUnsafe(`ALTER TABLE audit_logs DISABLE TRIGGER ${trigger}`)).rejects.toThrow(/must be owner|permission denied/);
    }
    await expect(prisma.$executeRawUnsafe('UPDATE audit_logs SET reason = reason WHERE false')).rejects.toThrow(/permission denied/);
  });
});

describe('GET /api/audit-logs/verify', () => {
  test('auditor → 200 ok with the chain head; holder → 403', async () => {
    const auditor = await createUser('AUDITOR');
    const res = await request(app).get('/api/audit-logs/verify').set(auditor.auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, problems: [], head: { chainSeq: expect.stringMatching(/^\d+$/), hash: expect.stringMatching(/^[0-9a-f]{64}$/) } });
    expect(res.body.records).toBeGreaterThan(0);
    const holder = await createUser();
    expect((await request(app).get('/api/audit-logs/verify').set(holder.auth)).status).toBe(403);
  });

  test('after real tampering → 500 with the broken record; restoring the content → ok again', async () => {
    const admin = await createUser('ADMIN');
    const row = await audit.record({ action: 'TEST_CHAIN', outcome: 'REFUSED', reason: marker() });
    const toggle = (on) => ownerDb().$executeRawUnsafe(`ALTER TABLE audit_logs ${on ? 'ENABLE' : 'DISABLE'} TRIGGER audit_logs_append_only`);
    try {
      await toggle(false);
      await ownerDb().$executeRaw`UPDATE audit_logs SET outcome = 'SUCCESS' WHERE id = ${row.id}::uuid`;
      await toggle(true);
      const broken = await request(app).get('/api/audit-logs/verify').set(admin.auth);
      expect(broken.status).toBe(500);
      expect(broken.body.ok).toBe(false);
      expect(broken.body.problems[0]).toEqual({ chainSeq: row.chainSeq.toString(), problem: 'content changed after it was written' });
    } finally {
      await toggle(false);
      await ownerDb().$executeRaw`UPDATE audit_logs SET outcome = 'REFUSED' WHERE id = ${row.id}::uuid`;
      await toggle(true);
    }
    expect((await request(app).get('/api/audit-logs/verify').set(admin.auth)).body.ok).toBe(true);
  });
});

describe('sensitive data never lands in the audit trail', () => {
  test('password-, token- and cookie-like keys are redacted at any depth; long text is cut', async () => {
    const row = await audit.record({
      action: 'TEST_REDACT', outcome: 'SUCCESS',
      metadata: { note: 'ok', password: 'Secret123', nested: { newPassword: 'x', accessToken: 'eyJ…', list: [{ cookie: 'll_session=…' }] }, long: 'a'.repeat(900) },
    });
    expect(row.metadata).toEqual({
      note: 'ok', password: '[REDACTED]', nested: { newPassword: '[REDACTED]', accessToken: '[REDACTED]', list: [{ cookie: '[REDACTED]' }] },
      long: `${'a'.repeat(500)}…`,
    });
  });

  test('an admin opening a user\'s details is itself audited (personal data access)', async () => {
    const admin = await createUser('ADMIN');
    const holder = await createUser();
    await request(app).get(`/api/admin/users/${holder.user.id}`).set(admin.auth).expect(200);
    const entry = await prisma.auditLog.findFirst({ where: { action: 'USER_VIEW_DETAILS', actorId: admin.user.id, entityId: holder.user.id } });
    expect(entry).toMatchObject({ outcome: 'SUCCESS', metadata: { profileShown: true } });
  });
});

describe('security events are recorded', () => {
  test('a token used after logout → 401 and AUTH_SESSION_REJECTED (SESSION_REVOKED)', async () => {
    const holder = await createUser();
    const login = await request(app).post('/api/auth/login').set('X-Auth-Mode', 'bearer').send({ email: holder.user.email, password: 'Secret123' });
    const auth = { Authorization: `Bearer ${login.body.token}` };
    await request(app).post('/api/auth/logout').set(auth).expect(204);
    expect((await request(app).get('/api/accounts').set(auth)).status).toBe(401);
    const entry = await prisma.auditLog.findFirst({ where: { action: 'AUTH_SESSION_REJECTED', actorId: holder.user.id } });
    expect(entry).toMatchObject({ outcome: 'REFUSED', reason: 'SESSION_REVOKED', metadata: { method: 'GET', path: '/api/accounts' } });
  });

  test('a deactivated user\'s token → 401 and AUTH_SESSION_REJECTED (USER_INACTIVE)', async () => {
    const holder = await createUser();
    await prisma.user.update({ where: { id: holder.user.id }, data: { isActive: false } });
    expect((await request(app).get('/api/accounts').set(holder.auth)).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: 'AUTH_SESSION_REJECTED', actorId: holder.user.id, reason: 'USER_INACTIVE' } })).toBe(1);
  });
});

describe('password rules (step 6)', () => {
  const register = (email, password) => request(app).post('/api/auth/register').send({ email, password, fullName: 'Password Rules' });

  test.each(['Password123', 'Welcome1', 'Admin@123', 'Qwerty123', 'LedgerLine123'])('a very common password (%s) → 400', async (password) => {
    const res = await register(`pw-${crypto.randomUUID()}@test.local`, password);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({ field: 'password', message: 'This password is too common – choose a less predictable one' });
  });

  test('a password containing the email name → 400; a different one is fine', async () => {
    const local = `ravindra${crypto.randomUUID().slice(0, 4)}`;
    const res = await register(`${local}@test.local`, `${local[0].toUpperCase()}${local.slice(1)}9`);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({ field: 'password', message: 'Password must not contain your email address' });
    expect((await register(`${local}@test.local`, 'Unrelated42x')).status).toBe(201);
  });

  test('change-password applies the same rules', async () => {
    const holder = await createUser();
    const change = (newPassword) => request(app).post('/api/auth/change-password').set(holder.auth).send({ currentPassword: 'Secret123', newPassword });
    expect((await change('Welcome123')).body.error.details[0].field).toBe('newPassword');
    // The email is "account_holder-<uuid>@test.local" → its parts include "holder".
    const containsEmail = await change('MyHolder77');
    expect(containsEmail.status).toBe(400);
    expect(containsEmail.body.error.details).toContainEqual({ field: 'newPassword', message: 'Password must not contain your email address' });
  });
});

describe('audit log filters', () => {
  test('entityType and a time window; "from" after "to" → 400', async () => {
    const auditor = await createUser('AUDITOR');
    const from = new Date(Date.now() - 60_000).toISOString();
    const res = await request(app).get('/api/audit-logs').query({ entityType: 'User', from, limit: 100 }).set(auditor.auth);
    expect(res.status).toBe(200);
    expect(res.body.items.every((e) => e.entityType === 'User' && new Date(e.createdAt) >= new Date(from))).toBe(true);
    expect(res.body.items[0].chainSeq).toMatch(/^\d+$/); // BigInt as a string in JSON
    const bad = await request(app).get('/api/audit-logs').query({ from: '2026-12-01', to: '2026-11-01' }).set(auditor.auth);
    expect(bad.status).toBe(400);
  });
});
