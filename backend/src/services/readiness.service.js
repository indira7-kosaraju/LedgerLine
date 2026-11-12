// Readiness: may this server receive traffic? Every check must pass (each within CHECK_TIMEOUT_MS):
//   database – a query works
//   redis    – the rate-limit store answers PING (outside production, "not_configured" is allowed)
//   schema   – the ledger-protection triggers and CHECK constraints from the migrations exist. The API role
//              can't read _prisma_migrations (by design), so a missing migration shows up here instead.
//   dbRole   – the API runs as a LIMITED role (owns no tables, cannot create, no special attributes) –
//              catches a DATABASE_URL that uses the table owner by mistake
// The response only says ok / failed per check; the reason goes to the server log, never to the client.
const prisma = require('../config/prisma');
const redis = require('../config/redis');
const env = require('../config/env');
const { REQUIRED_TRIGGERS, REQUIRED_CONSTRAINTS } = require('../config/schemaRequirements');

const CHECK_TIMEOUT_MS = 2000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function checkDatabase(db) {
  await db.$queryRaw`SELECT 1`;
}

async function checkSchema(db, { triggers = REQUIRED_TRIGGERS, constraints = REQUIRED_CONSTRAINTS } = {}) {
  const present = new Set((await db.$queryRaw`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal`).map((t) => t.tgname));
  const checks = new Set((await db.$queryRaw`SELECT conname FROM pg_constraint WHERE contype = 'c'`).map((c) => c.conname));
  const missing = [...triggers.filter((t) => !present.has(t)), ...constraints.filter((c) => !checks.has(c))];
  if (missing.length) throw new Error(`missing: ${missing.join(', ')} (migrations not applied?)`);
}

async function checkDbRole(db) {
  const [role] = await db.$queryRaw`
    SELECT r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolbypassrls OR r.rolreplication AS special,
           has_schema_privilege('public', 'CREATE') AS "canCreate",
           (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user) AS owned
    FROM pg_roles r WHERE r.rolname = current_user`;
  if (!role || role.special || role.canCreate || role.owned > 0) {
    throw new Error('DATABASE_URL is not the limited API role (it owns tables, can create, or has special attributes)');
  }
}

async function checkRedis(redisPing, production) {
  if (!redisPing) {
    if (production) throw new Error('REDIS_URL is not set');
    return 'not_configured';
  }
  await redisPing();
  return 'ok';
}

// Dependencies can be replaced in tests.
async function runReadiness({
  db = prisma,
  redisPing = redis.configured ? redis.ping : null,
  production = env.NODE_ENV === 'production',
  schema,
  timeoutMs = CHECK_TIMEOUT_MS,
  log = console.error,
} = {}) {
  const definitions = {
    database: () => checkDatabase(db),
    redis: () => checkRedis(redisPing, production),
    schema: () => checkSchema(db, schema),
    dbRole: () => checkDbRole(db),
  };
  const checks = Object.fromEntries(Object.keys(definitions).map((name) => [name, null])); // stable order
  await Promise.all(
    Object.entries(definitions).map(async ([name, run]) => {
      try {
        checks[name] = (await withTimeout(run(), timeoutMs)) ?? 'ok';
      } catch (err) {
        checks[name] = 'failed';
        log(`Readiness check "${name}" failed: ${redis.redact(err.message)}`);
      }
    })
  );
  return { ready: Object.values(checks).every((c) => c !== 'failed'), checks };
}

module.exports = { runReadiness, CHECK_TIMEOUT_MS };
