// Step 3: rate-limit counters in REDIS – per-account lockout, shared between server instances, surviving a
// restart, and storing no email addresses. (Per-IP limits: rateLimit.test.js; Redis down: redisDown.test.js.)
process.env.AUTH_LOGIN_FAILURE_LIMIT = '1000'; // the per-IP limit stays out of the way here
process.env.AUTH_ACCOUNT_FAILURE_LIMIT = '3';

const { createClient } = require('redis');
const { app, prisma, request, createUser } = require('../helpers');

afterAll(() => prisma.$disconnect());

const PASSWORD = 'Secret123'; // helpers.createUser
const login = (server, email, password) => request(server).post('/api/auth/login').send({ email, password });
const failThreeTimes = async (server, email) => {
  for (let i = 0; i < 3; i++) expect((await login(server, email, 'WrongPass1')).status).toBe(401);
};

describe('per-account lockout (failed attempts per email, from any IP)', () => {
  test('after 3 failures even the CORRECT password gets 429 – but other accounts are not affected', async () => {
    const { user } = await createUser();
    const { user: other } = await createUser();
    await failThreeTimes(app, user.email);

    const blocked = await login(app, user.email, PASSWORD);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect((await login(app, other.email, PASSWORD)).status).toBe(200); // same IP, different account
  });

  test('the email is normalised: " USER@…" and "user@…" are the same counter', async () => {
    const { user } = await createUser();
    const variants = [user.email.toUpperCase(), ` ${user.email} `, user.email];
    for (const email of variants) await login(app, email, 'WrongPass1');
    expect((await login(app, user.email, PASSWORD)).status).toBe(429);
  });

  test('an unknown email is limited the same way (the limit reveals nothing about which accounts exist)', async () => {
    const known = (await createUser()).user.email;
    const unknown = `nobody-${Date.now()}@test.local`;
    await failThreeTimes(app, known);
    await failThreeTimes(app, unknown);
    const [a, b] = await Promise.all([login(app, known, 'WrongPass1'), login(app, unknown, 'WrongPass1')]);
    expect([a.status, b.status]).toEqual([429, 429]);
    expect(a.body).toEqual(b.body);
  });

  test('wrong current passwords on change-password count toward the same account limit', async () => {
    const { user, auth } = await createUser();
    await login(app, user.email, 'WrongPass1');
    await login(app, user.email, 'WrongPass1');
    const wrong = await request(app).post('/api/auth/change-password').set(auth).send({ currentPassword: 'WrongPass1', newPassword: 'NewSecret456' });
    expect(wrong.status).toBe(400);
    expect((await login(app, user.email, PASSWORD)).status).toBe(429);
  });

  test('successful logins do not count', async () => {
    const { user } = await createUser();
    for (let i = 0; i < 5; i++) expect((await login(app, user.email, PASSWORD)).status).toBe(200);
  });
});

describe('counters live in Redis', () => {
  test('shared by two server instances, and still there after a "restart" (a freshly loaded app)', async () => {
    const { user } = await createUser();
    let second;
    jest.isolateModules(() => {
      second = { app: require('../../src/app'), redis: require('../../src/config/redis'), prisma: require('../../src/config/prisma') };
    });
    try {
      await failThreeTimes(app, user.email); // instance A
      expect((await login(second.app, user.email, PASSWORD)).status).toBe(429); // instance B / after restart
    } finally {
      await second.redis.disconnect();
      await second.prisma.$disconnect();
    }
  });

  test('keys use the environment prefix, contain no email address, and expire', async () => {
    const { user } = await createUser();
    await login(app, user.email, 'WrongPass1');
    const client = createClient({ url: process.env.REDIS_URL });
    await client.connect();
    try {
      const keys = [];
      for await (const batch of client.scanIterator({ MATCH: `${process.env.REDIS_KEY_PREFIX}*`, COUNT: 500 })) keys.push(...batch);
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.every((k) => k.startsWith('ll:test:'))).toBe(true);
      expect(keys.some((k) => k.includes('@') || k.includes(user.email.split('@')[0]))).toBe(false);
      const ttls = await Promise.all(keys.map((k) => client.pTTL(k)));
      expect(ttls.every((ms) => ms > 0 && ms <= 60 * 60 * 1000)).toBe(true);
    } finally {
      client.destroy();
    }
  });
});
