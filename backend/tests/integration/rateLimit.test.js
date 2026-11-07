// Rate limiting with small limits (this file only – each Jest file has its own modules,
// so the app below is built with these values instead of the generous .env.test ones).
process.env.AUTH_LOGIN_FAILURE_LIMIT = '3';
process.env.AUTH_REGISTER_LIMIT = '2';

const crypto = require('crypto');
const { app, prisma, request } = require('../helpers');

afterAll(() => prisma.$disconnect());

test('after 3 failed logins the 4th attempt is blocked with 429 and Retry-After', async () => {
  const email = `rl-${crypto.randomUUID()}@test.local`;
  for (let i = 0; i < 3; i++) {
    expect((await request(app).post('/api/auth/login').send({ email, password: 'WrongPass1' })).status).toBe(401);
  }
  const blocked = await request(app).post('/api/auth/login').send({ email, password: 'WrongPass1' });
  expect(blocked.status).toBe(429);
  expect(blocked.body.error.code).toBe('RATE_LIMITED');
  expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
});

test('registration is limited per IP', async () => {
  const signUp = () => request(app).post('/api/auth/register').send({ email: `rl-${crypto.randomUUID()}@test.local`, password: 'Secret123', fullName: 'Rate Limit' });
  expect((await signUp()).status).toBe(201);
  expect((await signUp()).status).toBe(201);
  expect((await signUp()).status).toBe(429);
});
