// Step 3: liveness and readiness (GET /api/health/live, GET /api/health/ready; services/readiness.service.js).
process.env.RATE_LIMIT_MAX = '10'; // to show that health checks are NOT rate limited

const { app, prisma, ownerDb, disconnectAll, request } = require('../helpers');
const { runReadiness } = require('../../src/services/readiness.service');
const redis = require('../../src/config/redis');
const { REQUIRED_TRIGGERS } = require('../../src/config/schemaRequirements');

afterAll(disconnectAll);

const quiet = () => {}; // runReadiness logs failures – keep test output clean
const deps = (overrides) => ({ db: prisma, redisPing: redis.ping, production: true, log: quiet, ...overrides });

test('GET /api/health/ready → 200 when database, Redis, schema and role are all fine', async () => {
  const res = await request(app).get('/api/health/ready');
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ status: 'ready', checks: { database: 'ok', redis: 'ok', schema: 'ok', dbRole: 'ok' } });
  expect(res.headers['cache-control']).toBe('no-store');
});

test('GET /api/health/live → 200 without touching any dependency', async () => {
  const res = await request(app).get('/api/health/live');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('alive');
});

test('connected as the table OWNER instead of the API role → dbRole failed (wrong DATABASE_URL)', async () => {
  const result = await runReadiness(deps({ db: ownerDb() }));
  expect(result).toEqual({ ready: false, checks: { database: 'ok', redis: 'ok', schema: 'ok', dbRole: 'failed' } });
});

test('a protection trigger missing (migration not applied) → schema failed; the reason goes only to the log', async () => {
  const logged = [];
  const result = await runReadiness(deps({ schema: { triggers: [...REQUIRED_TRIGGERS, 'zz_missing_trigger'] }, log: (m) => logged.push(m) }));
  expect(result.ready).toBe(false);
  expect(result.checks.schema).toBe('failed');
  expect(JSON.stringify(result)).not.toContain('zz_missing_trigger');
  expect(logged.join('\n')).toContain('zz_missing_trigger');
});

test('a check that hangs fails after the timeout instead of blocking readiness', async () => {
  const hanging = { $queryRaw: () => new Promise(() => {}) };
  const started = Date.now();
  const result = await runReadiness(deps({ db: hanging, timeoutMs: 300 }));
  expect(Date.now() - started).toBeLessThan(2000);
  expect(result.checks).toMatchObject({ database: 'failed', schema: 'failed', dbRole: 'failed', redis: 'ok' });
});

test('no Redis configured: a failure in production, allowed (not_configured) in development', async () => {
  expect(await runReadiness(deps({ redisPing: null, production: true }))).toMatchObject({ ready: false, checks: { redis: 'failed' } });
  expect(await runReadiness(deps({ redisPing: null, production: false }))).toMatchObject({ ready: true, checks: { redis: 'not_configured' } });
});

test('health checks are not rate limited (Render polls them), the API still is', async () => {
  const health = await Promise.all(Array.from({ length: 15 }, () => request(app).get('/api/health/ready')));
  expect(health.every((r) => r.status === 200)).toBe(true);
  const api = [];
  for (let i = 0; i < 12; i++) api.push((await request(app).get('/api/accounts')).status);
  expect(api.slice(0, 10).every((s) => s === 401)).toBe(true); // not logged in, but counted
  expect(api.slice(10)).toEqual([429, 429]);
});
