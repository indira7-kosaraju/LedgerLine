// Step 3, option A – Redis unreachable (nothing listens on port 6390):
//   login / register / change-password fail CLOSED (503), the rest of the API keeps working (fail OPEN),
//   liveness stays green, readiness turns red without revealing why.
process.env.REDIS_URL = 'redis://127.0.0.1:6390/1';

const { app, prisma, request, createUser, createAccount, deposit } = require('../helpers');

afterAll(() => prisma.$disconnect());

test('login, registration and change-password are refused with 503 – never let through unlimited', async () => {
  const { user, auth } = await createUser();
  const started = Date.now();
  const login = await request(app).post('/api/auth/login').send({ email: user.email, password: 'Secret123' });
  expect(Date.now() - started).toBeLessThan(5000); // fails fast instead of hanging
  expect(login.status).toBe(503);
  expect(login.body.error.code).toBe('SERVICE_UNAVAILABLE');
  expect(login.headers['set-cookie']).toBeUndefined(); // no session was created

  const register = await request(app).post('/api/auth/register').send({ email: `down-${Date.now()}@test.local`, password: 'Secret123', fullName: 'Redis Down' });
  expect(register.status).toBe(503);
  expect(await prisma.user.count({ where: { email: { startsWith: 'down-' } } })).toBe(0);

  const change = await request(app).post('/api/auth/change-password').set(auth).send({ currentPassword: 'Secret123', newPassword: 'NewSecret456' });
  expect(change.status).toBe(503);

  // Step 6: each refusal is recorded (outcome ERROR – the limiter could not decide)
  expect(await prisma.auditLog.count({ where: { action: 'AUTH_RATE_LIMIT_UNAVAILABLE', outcome: 'ERROR', createdAt: { gte: new Date(started) } } })).toBeGreaterThanOrEqual(3);
});

test('the rest of the API keeps working (general limit fails open): accounts and a deposit', async () => {
  const holder = await createUser();
  const account = await createAccount(holder);
  expect((await deposit(holder, account.id, 1000)).status).toBe(201);
  const started = Date.now();
  expect((await request(app).get('/api/accounts').set(holder.auth)).status).toBe(200);
  expect(Date.now() - started).toBeLessThan(1000); // an outage must not make every request slower
});

test('liveness and /api/health stay 200; readiness is 503 and only names the failed check', async () => {
  expect((await request(app).get('/api/health/live')).status).toBe(200);
  expect((await request(app).get('/api/health')).status).toBe(200);

  const ready = await request(app).get('/api/health/ready');
  expect(ready.status).toBe(503);
  expect(ready.body).toMatchObject({ status: 'not_ready', checks: { database: 'ok', redis: 'failed', schema: 'ok', dbRole: 'ok' } });
  expect(JSON.stringify(ready.body)).not.toMatch(/redis:\/\/|6390|ECONNREFUSED|timed out/i);
});
