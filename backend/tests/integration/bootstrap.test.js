// First-admin bootstrap: npm run admin:bootstrap (scripts/bootstrap-admin.js + adminBootstrap.service.js).
//
// The rule "only if no active admin exists" needs a database WITHOUT active admins, so every
// test starts by deactivating all admins; afterAll restores exactly the admins that were active
// before (test files run one after another, see jest.config.js).
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { app, prisma, request, createUser } = require('../helpers');
const { bootstrapFirstAdmin, DEMO_ADMIN_EMAIL } = require('../../src/services/adminBootstrap.service');

const PASSWORD = 'FirstAdmin123';
const uniqueEmail = () => `boot-${crypto.randomUUID()}@test.local`;
const activeAdminCount = () => prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
const deactivateAllAdmins = () => prisma.user.updateMany({ where: { role: 'ADMIN', isActive: true }, data: { isActive: false } });

let originallyActive;
beforeAll(async () => {
  originallyActive = (await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } })).map((u) => u.id);
});
beforeEach(deactivateAllAdmins);
afterAll(async () => {
  await deactivateAllAdmins();
  await prisma.user.updateMany({ where: { id: { in: originallyActive } }, data: { isActive: true } });
  await prisma.$disconnect();
});

describe('bootstrapFirstAdmin', () => {
  test('no active admin → creates the admin (bcrypt hash), audited, and it can log in', async () => {
    const email = uniqueEmail();
    const { admin, demoAdminDeactivated } = await bootstrapFirstAdmin({ email, fullName: 'First Admin', password: PASSWORD });
    expect(admin).toMatchObject({ email, role: 'ADMIN' });
    expect(demoAdminDeactivated).toBe(false);

    const stored = await prisma.user.findUnique({ where: { email } });
    expect(stored.passwordHash).toMatch(/^\$2b\$/);
    expect(stored.passwordHash).not.toContain(PASSWORD);

    const entry = await prisma.auditLog.findFirst({ where: { action: 'ADMIN_BOOTSTRAP', outcome: 'SUCCESS', entityId: admin.id } });
    expect(entry).not.toBeNull();
    expect(JSON.stringify(entry)).not.toContain(PASSWORD);

    const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('ADMIN');
  });

  test('an active admin already exists → 409 ADMIN_ALREADY_EXISTS, nothing created, refusal audited', async () => {
    await createUser('ADMIN');
    const email = uniqueEmail();
    await expect(bootstrapFirstAdmin({ email, fullName: 'Second Admin', password: PASSWORD })).rejects.toMatchObject({ code: 'ADMIN_ALREADY_EXISTS' });
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    expect(await activeAdminCount()).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'ADMIN_BOOTSTRAP', outcome: 'REFUSED', reason: 'ADMIN_ALREADY_EXISTS', metadata: { path: ['email'], equals: email } } })).toBe(1);
  });

  test('an existing user is never promoted → 409 EMAIL_TAKEN', async () => {
    const holder = await createUser();
    await expect(bootstrapFirstAdmin({ email: holder.user.email, fullName: 'Takeover', password: PASSWORD })).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
    expect((await prisma.user.findUnique({ where: { id: holder.user.id } })).role).toBe('ACCOUNT_HOLDER');
    expect(await activeAdminCount()).toBe(0);
  });

  test.each([
    ['weak password', { password: 'password' }, 'password'],
    ['invalid email', { email: 'not-an-email' }, 'email'],
    ['short name', { fullName: 'A' }, 'fullName'],
  ])('%s → 400 VALIDATION_ERROR, nothing created', async (_, override, field) => {
    const input = { email: uniqueEmail(), fullName: 'First Admin', password: PASSWORD, ...override };
    await expect(bootstrapFirstAdmin(input)).rejects.toMatchObject({ code: 'VALIDATION_ERROR', details: expect.arrayContaining([expect.objectContaining({ field })]) });
    expect(await activeAdminCount()).toBe(0);
  });

  test('5 runs at the same moment → exactly ONE admin (advisory lock)', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => bootstrapFirstAdmin({ email: uniqueEmail(), fullName: `Racer ${i}`, password: PASSWORD }))
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected').map((r) => r.reason.code)).toEqual(Array(4).fill('ADMIN_ALREADY_EXISTS'));
    expect(await activeAdminCount()).toBe(1);
  });

  // The 5-run test above can pass by luck if the runs happen not to overlap, so this one forces
  // the overlap: another transaction holds the lock, and bootstrap must WAIT until it is released.
  test('a run waits while another run holds the bootstrap lock', async () => {
    let release;
    const held = new Promise((resolve) => (release = resolve));
    const other = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('ledgerline:first-admin-bootstrap'))`;
        await held;
      },
      { timeout: 20000 }
    );
    const lockHeld = async () => (await prisma.$queryRaw`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND granted`)[0].n > 0;
    while (!(await lockHeld())) await new Promise((r) => setTimeout(r, 20));

    let finished = false;
    const run = bootstrapFirstAdmin({ email: uniqueEmail(), fullName: 'Waiting Admin', password: PASSWORD }).then(() => (finished = true));
    await new Promise((r) => setTimeout(r, 700));
    expect(finished).toBe(false); // blocked on the lock
    expect(await activeAdminCount()).toBe(0);

    release();
    await other;
    await run;
    expect(finished).toBe(true);
    expect(await activeAdminCount()).toBe(1);
  });

  describe('replacing the public demo admin', () => {
    let demoToken;
    beforeEach(async () => {
      // A demo admin with a working session, like on the deployed site before the fix.
      const existing = await prisma.user.findUnique({ where: { email: DEMO_ADMIN_EMAIL } });
      const demo = existing
        ? await prisma.user.update({ where: { id: existing.id }, data: { isActive: true } })
        : await prisma.user.create({ data: { email: DEMO_ADMIN_EMAIL, fullName: 'Demo Administrator', role: 'ADMIN', passwordHash: 'x' } });
      demoToken = require('../../src/utils/jwt').signAccessToken(demo);
      expect((await request(app).get('/api/admin/users').set('Authorization', `Bearer ${demoToken}`)).status).toBe(200);
    });

    test('without --replace-demo-admin → refused, demo admin untouched', async () => {
      await expect(bootstrapFirstAdmin({ email: uniqueEmail(), fullName: 'Real Admin', password: PASSWORD })).rejects.toMatchObject({ code: 'ADMIN_ALREADY_EXISTS' });
      expect((await prisma.user.findUnique({ where: { email: DEMO_ADMIN_EMAIL } })).isActive).toBe(true);
    });

    test('with replaceDemoAdmin → demo admin deactivated and its session revoked, real admin created, both audited', async () => {
      const { admin, demoAdminDeactivated } = await bootstrapFirstAdmin({ email: uniqueEmail(), fullName: 'Real Admin', password: PASSWORD, replaceDemoAdmin: true });
      expect(demoAdminDeactivated).toBe(true);
      const demo = await prisma.user.findUnique({ where: { email: DEMO_ADMIN_EMAIL } });
      expect(demo.isActive).toBe(false);
      expect((await request(app).get('/api/admin/users').set('Authorization', `Bearer ${demoToken}`)).status).toBe(401);
      expect(await activeAdminCount()).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: 'USER_SET_STATUS', reason: 'DEMO_ADMIN_REPLACED', entityId: demo.id } })).toBeGreaterThanOrEqual(1);
      expect(await prisma.auditLog.count({ where: { action: 'ADMIN_BOOTSTRAP', outcome: 'SUCCESS', entityId: admin.id } })).toBe(1);
    });

    test('with replaceDemoAdmin but ANOTHER real admin active → refused, and the demo admin stays active (rolled back)', async () => {
      await createUser('ADMIN');
      await expect(bootstrapFirstAdmin({ email: uniqueEmail(), fullName: 'Real Admin', password: PASSWORD, replaceDemoAdmin: true })).rejects.toMatchObject({ code: 'ADMIN_ALREADY_EXISTS' });
      expect((await prisma.user.findUnique({ where: { email: DEMO_ADMIN_EMAIL } })).isActive).toBe(true);
    });
  });
});

describe('scripts/bootstrap-admin.js (the command itself)', () => {
  // stdin = "password\nrepeat\n" (no terminal → the script reads the two lines from stdin).
  const run = (args, stdin) =>
    spawnSync('node', ['scripts/bootstrap-admin.js', ...args], { cwd: path.join(__dirname, '../..'), input: stdin, encoding: 'utf8', env: process.env });

  test('creates the admin and never prints the password', () => {
    const email = uniqueEmail();
    const out = run(['--email', email, '--name', 'Cli Admin'], `${PASSWORD}\n${PASSWORD}\n`);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain(`First admin created: ${email}`);
    expect(out.stdout + out.stderr).not.toContain(PASSWORD);
  });

  test('passwords that do not match → exit 1, nothing created', async () => {
    const email = uniqueEmail();
    const out = run(['--email', email, '--name', 'Cli Admin'], `${PASSWORD}\nOther123x\n`);
    expect(out.status).toBe(1);
    expect(out.stderr).toContain('do not match');
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  test('a second run is refused (exit 1) once an admin exists', () => {
    expect(run(['--email', uniqueEmail(), '--name', 'One'], `${PASSWORD}\n${PASSWORD}\n`).status).toBe(0);
    const second = run(['--email', uniqueEmail(), '--name', 'Two'], `${PASSWORD}\n${PASSWORD}\n`);
    expect(second.status).toBe(1);
    expect(second.stderr).toContain('An active admin already exists');
  });
});
