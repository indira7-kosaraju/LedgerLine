// Step 3: in production the server refuses to start without a working Redis – it never silently falls back to
// in-memory counters (a restart would then reset every login limit). Starts the real src/server.js.
const path = require('path');
const { spawn } = require('child_process');

const backend = path.join(__dirname, '../..');

function startServer(overrides) {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: backend,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '4098',
      JWT_SECRET: 'x'.repeat(40),
      CORS_ORIGIN: 'https://example.test',
      ...overrides,
    },
  });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  // A server that wrongly keeps running is stopped after 15 s, so the test fails instead of hanging.
  const guard = setTimeout(() => child.kill('SIGKILL'), 15_000);
  const exited = new Promise((resolve) => child.on('exit', (code) => { clearTimeout(guard); resolve(code); }));
  return { child, exited, output: () => output };
}

test('production without REDIS_URL → refuses to start', async () => {
  const server = startServer({ REDIS_URL: '' });
  expect(await server.exited).toBe(1);
  expect(server.output()).toContain('REDIS_URL is required in production');
});

test('production with an unreachable Redis → refuses to start (and does not print the URL)', async () => {
  const server = startServer({ REDIS_URL: 'redis://:secret-in-url@127.0.0.1:6390/1' });
  expect(await server.exited).toBe(1);
  expect(server.output()).toContain('Could not connect to Redis');
  expect(server.output()).not.toContain('secret-in-url');
}, 20_000);

test('production with Redis → starts, and readiness is green', async () => {
  const server = startServer({});
  try {
    for (let i = 0; i < 50 && !server.output().includes('LedgerLine API running'); i++) await new Promise((r) => setTimeout(r, 100));
    expect(server.output()).toContain('LedgerLine API running');
    const res = await fetch('http://127.0.0.1:4098/api/health/ready');
    expect(res.status).toBe(200);
  } finally {
    server.child.kill('SIGTERM');
    expect(await server.exited).toBe(0); // clean shutdown closes PostgreSQL and Redis
  }
}, 20_000);
