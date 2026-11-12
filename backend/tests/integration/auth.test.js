// Authentication: registration, login, sessions (HttpOnly cookie / Bearer), CSRF, tokens.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { app, prisma, request, createUser, TEST_PROFILE } = require('../helpers');

afterAll(() => prisma.$disconnect());

const PASSWORD = 'Secret123';
const uniqueEmail = () => `auth-${crypto.randomUUID()}@test.local`;
const register = (body, headers = {}) => request(app).post('/api/auth/register').set(headers).send(body);
const login = (email, password, headers = {}) => request(app).post('/api/auth/login').set(headers).send({ email, password });
const sessionCookie = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('ll_session='));

describe('Registration', () => {
  test('creates an ACCOUNT_HOLDER, sets a secure session cookie, never returns the token or hash', async () => {
    const email = uniqueEmail();
    const res = await register({ email, password: PASSWORD, fullName: 'Reg Test' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email, role: 'ACCOUNT_HOLDER', isActive: true });
    expect(res.body.token).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2b\$/);

    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api/);

    const stored = await prisma.user.findUnique({ where: { email } });
    expect(stored.passwordHash).toMatch(/^\$2b\$10\$/); // bcrypt, never plain text
    expect(stored.passwordHash).not.toContain(PASSWORD);
  });

  test('API clients can ask for the token with X-Auth-Mode: bearer', async () => {
    const res = await register({ email: uniqueEmail(), password: PASSWORD, fullName: 'Api Client' }, { 'X-Auth-Mode': 'bearer' });
    expect(res.status).toBe(201);
    expect(res.body.token.split('.')).toHaveLength(3);
  });

  test('email is trimmed + lowercased; a duplicate in any case → 409', async () => {
    const email = uniqueEmail();
    expect((await register({ email: `  ${email.toUpperCase()} `, password: PASSWORD, fullName: 'Case Test' })).body.user.email).toBe(email);
    const dup = await register({ email: email.toUpperCase(), password: PASSWORD, fullName: 'Case Test' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');
  });

  test.each([
    ['choosing a role', { role: 'ADMIN' }],
    ['setting isActive', { isActive: true }],
  ])('mass assignment (%s) → 400', async (_, extra) => {
    const res = await register({ email: uniqueEmail(), password: PASSWORD, fullName: 'Evil User', ...extra });
    expect(res.status).toBe(400);
  });

  test.each([
    ['too short', 'Ab1'],
    ['no uppercase', 'secret123'],
    ['no digit', 'SecretPass'],
    ['over 72 bytes', `Aa1${'é'.repeat(40)}`],
  ])('weak password (%s) → 400', async (_, password) => {
    const res = await register({ email: uniqueEmail(), password, fullName: 'Weak Pass' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.field === 'password')).toBe(true);
  });
});

describe('Login and session', () => {
  let email;
  beforeAll(async () => {
    email = uniqueEmail();
    await register({ email, password: PASSWORD, fullName: 'Login Test' });
  });

  test('correct password → 200 + cookie; the cookie works for /me', async () => {
    const res = await login(email, PASSWORD);
    expect(res.status).toBe(200);
    const cookie = sessionCookie(res).split(';')[0];
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
  });

  test('wrong password and unknown email give the SAME 401 message', async () => {
    const wrong = await login(email, 'WrongPass1');
    const unknown = await login(uniqueEmail(), 'WrongPass1');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  test('GET /me returns the profile and never the password hash', async () => {
    const cookie = sessionCookie(await login(email, PASSWORD)).split(';')[0];
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(Object.keys(me.body.user).sort()).toEqual(['createdAt', 'email', 'fullName', 'id', 'isActive', 'onboardingStatus', 'role', 'updatedAt']);
  });

  test('a deactivated user cannot log in – same generic 401, real reason only in the audit log', async () => {
    const other = uniqueEmail();
    await register({ email: other, password: PASSWORD, fullName: 'Inactive User' });
    await prisma.user.update({ where: { email: other }, data: { isActive: false } });

    const res = await login(other, PASSWORD);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid email or password'); // doesn't reveal the account exists
    expect(sessionCookie(res)).toBeUndefined();
    const audit = await prisma.auditLog.findFirst({ where: { action: 'AUTH_LOGIN', reason: 'USER_INACTIVE', metadata: { path: ['email'], equals: other } } });
    expect(audit).not.toBeNull();
  });

  test('logout → 204 and the cookie is cleared', async () => {
    const res = await request(app).post('/api/auth/logout').set('X-Requested-With', 'XMLHttpRequest');
    expect(res.status).toBe(204);
    expect(sessionCookie(res)).toMatch(/^ll_session=;/);
  });
});

describe('Token validation', () => {
  const secret = process.env.JWT_SECRET;
  const opts = { issuer: 'ledgerline', audience: 'ledgerline-api' };

  test('no token → 401', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });

  test('tampered, foreign-secret, alg:none and expired tokens → 401', async () => {
    const { user, token } = await createUser();
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, role: 'ADMIN', ...{ iss: 'ledgerline', aud: 'ledgerline-api' } })).toString('base64url')}.`;
    const candidates = {
      tampered: `${token.slice(0, -2)}xx`,
      foreignSecret: jwt.sign({ role: 'ADMIN' }, 'x'.repeat(40), { ...opts, subject: user.id }),
      algNone: none,
      expired: jwt.sign({ role: user.role }, secret, { ...opts, subject: user.id, expiresIn: -10 }),
      wrongAudience: jwt.sign({ role: user.role }, secret, { issuer: 'ledgerline', audience: 'someone-else', subject: user.id }),
    };
    for (const [name, value] of Object.entries(candidates)) {
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${value}`);
      expect([name, res.status]).toEqual([name, 401]);
    }
    const expired = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${candidates.expired}`);
    expect(expired.body.error.message).toBe('Token has expired');
  });

  test.each([
    ['wrong scheme', (t) => `Token ${t}`],
    ['empty Bearer', () => 'Bearer '],
    ['garbage', () => 'Bearer not.a.jwt'],
    ['two tokens', (t) => `Bearer ${t} ${t}`],
  ])('malformed Authorization header (%s) → 401', async (_, header) => {
    const { token } = await createUser();
    const res = await request(app).get('/api/auth/me').set('Authorization', header(token));
    expect(res.status).toBe(401);
  });

  test('an expired token inside the session cookie → 401 "Token has expired"', async () => {
    const { user } = await createUser();
    const expired = jwt.sign({ role: user.role }, secret, { ...opts, subject: user.id, expiresIn: -10 });
    const res = await request(app).get('/api/auth/me').set('Cookie', `ll_session=${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Token has expired');
  });

  test('a token for a user that no longer exists → 401', async () => {
    const ghost = jwt.sign({ role: 'ADMIN' }, secret, { ...opts, subject: crypto.randomUUID() });
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${ghost}`)).status).toBe(401);
  });

  test('the role inside a token is ignored – the role in the database counts', async () => {
    const { user } = await createUser('ACCOUNT_HOLDER');
    const forgedRole = jwt.sign({ role: 'ADMIN', sv: 0 }, secret, { ...opts, subject: user.id }); // validly signed (current session version), fake role
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${forgedRole}`);
    expect(res.status).toBe(403);
  });

  test("a deactivated user's valid token stops working immediately", async () => {
    const holder = await createUser();
    expect((await request(app).get('/api/auth/me').set(holder.auth)).status).toBe(200);
    await prisma.user.update({ where: { id: holder.user.id }, data: { isActive: false } });
    expect((await request(app).get('/api/auth/me').set(holder.auth)).status).toBe(401);
  });
});

describe('CSRF protection for cookie sessions', () => {
  let cookie;
  beforeAll(async () => {
    const email = uniqueEmail();
    const res = await register({ email, password: PASSWORD, fullName: 'Csrf Test' });
    cookie = sessionCookie(res).split(';')[0];
    // Onboarding (step 4) – otherwise opening an account is refused for that reason, not for CSRF.
    await request(app).post('/api/onboarding').set('Cookie', cookie).set('X-Requested-With', 'XMLHttpRequest').send(TEST_PROFILE).expect(200);
  });

  test('cookie + POST without X-Requested-With → 403 CSRF_REJECTED (audited)', async () => {
    const res = await request(app).post('/api/accounts').set('Cookie', cookie).send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_REJECTED');
    expect(await prisma.auditLog.count({ where: { reason: 'MISSING_CSRF_HEADER' } })).toBeGreaterThan(0);
  });

  test('cookie + POST with X-Requested-With → allowed', async () => {
    const res = await request(app).post('/api/accounts').set('Cookie', cookie).set('X-Requested-With', 'XMLHttpRequest').send({});
    expect(res.status).toBe(201);
  });

  test('cookie + GET needs no header (reads are not state-changing)', async () => {
    expect((await request(app).get('/api/accounts').set('Cookie', cookie)).status).toBe(200);
  });
});

describe('Change password', () => {
  const NEW_PASSWORD = 'Changed456';
  const change = (auth, body) => request(app).post('/api/auth/change-password').set(auth).set('X-Auth-Mode', 'bearer').send(body);
  let holder;
  beforeEach(async () => {
    holder = await createUser(); // password: Secret123
  });

  test('without a session → 401', async () => {
    const res = await request(app).post('/api/auth/change-password').send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(401);
  });

  test('wrong current password → 400 on the currentPassword field, password unchanged, audited', async () => {
    const res = await change(holder.auth, { currentPassword: 'WrongPass1', newPassword: NEW_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    expect(res.body.error.details).toEqual([{ field: 'currentPassword', message: 'Current password is incorrect' }]);
    expect((await login(holder.user.email, PASSWORD)).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'AUTH_CHANGE_PASSWORD', outcome: 'REFUSED', actorId: holder.user.id } })).toBe(1);
  });

  test.each([
    ['weak new password', { currentPassword: PASSWORD, newPassword: 'weak' }, 'newPassword'],
    ['new = current', { currentPassword: PASSWORD, newPassword: PASSWORD }, 'newPassword'],
    ['unknown field', { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, role: 'ADMIN' }, null],
  ])('%s → 400 VALIDATION_ERROR', async (_, body, field) => {
    const res = await change(holder.auth, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    if (field) expect(res.body.error.details.some((d) => d.field === field)).toBe(true);
  });

  test('success: new password works, old password and every OLD token stop working, this session gets a new token', async () => {
    const res = await change(holder.auth, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: holder.user.id, role: 'ACCOUNT_HOLDER' });
    expect(JSON.stringify(res.body.user)).not.toMatch(/passwordHash|sessionVersion/);
    expect(sessionCookie(res)).toMatch(/HttpOnly/i); // the browser's cookie is replaced, so it stays signed in

    // A copy of the old token (e.g. another device) is revoked.
    const old = await request(app).get('/api/auth/me').set(holder.auth);
    expect(old.status).toBe(401);
    expect(old.body.error.code).toBe('SESSION_REVOKED');
    // The new token works.
    expect((await request(app).get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`)).status).toBe(200);

    expect((await login(holder.user.email, PASSWORD)).status).toBe(401);
    expect((await login(holder.user.email, NEW_PASSWORD)).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'AUTH_CHANGE_PASSWORD', outcome: 'SUCCESS', actorId: holder.user.id } })).toBe(1);
  });
});
