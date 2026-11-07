// Authentication: registration, login, sessions (HttpOnly cookie / Bearer), CSRF, tokens.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { app, prisma, request, createUser } = require('../helpers');

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

  test('the role inside a token is ignored – the role in the database counts', async () => {
    const { user } = await createUser('ACCOUNT_HOLDER');
    const forgedRole = jwt.sign({ role: 'ADMIN' }, secret, { ...opts, subject: user.id }); // validly signed, fake role
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
