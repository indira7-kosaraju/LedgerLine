// Database roles, layer 1: the API connects as a LIMITED role (scripts/setup-db-roles.js), so even with
// full SQL access as the app – a bug, SQL injection or a stolen DATABASE_URL – PostgreSQL itself refuses
// schema changes, disabling triggers, and deleting or rewriting history.
// (Layer 2 – the triggers stop even the table owner – is tested in ledgerSecurity.test.js.)
const crypto = require('crypto');
const { prisma, ownerDb, disconnectAll } = require('../helpers');
const { PrismaClient } = require('@prisma/client');
const { PRIVILEGES, TRANSACTION_OPTIONS, parseUrls, setupRoles, privilegeReport, requiresPlaintextPassword, passwordLiteral, redact } = require('../../scripts/setup-db-roles');

afterAll(disconnectAll);

const config = parseUrls(process.env);
const DENIED = /permission denied|must be owner|must be superuser|must have admin option/i;

describe('the app connects as the limited API role', () => {
  test('current_user is the API role from DATABASE_URL, not the table owner', async () => {
    const [{ user }] = await prisma.$queryRaw`SELECT current_user AS "user"`;
    const [{ owner }] = await ownerDb().$queryRaw`SELECT current_user AS owner`;
    expect(user).toBe(config.role);
    expect(user).not.toBe(owner);
  });

  test('its privileges are EXACTLY the planned list, and it has no special attributes', async () => {
    const tables = (await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`).map((t) => t.tablename);
    expect(tables.sort()).toEqual(Object.keys(PRIVILEGES).sort());
    const { rows, attrs } = await privilegeReport(prisma, config.role, tables);
    expect(rows.filter((r) => !r.matches)).toEqual([]);
    expect(attrs).toMatchObject({ rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolbypassrls: false, rolreplication: false, schemaCreate: false, ownedTables: 0 });
  });
});

describe('PostgreSQL refuses everything the API does not need', () => {
  // "WHERE false" – the privilege check happens before execution, so no row could ever be touched.
  test.each([
    ['disable the append-only trigger', 'ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_append_only'],
    ['disable all triggers on accounts', 'ALTER TABLE accounts DISABLE TRIGGER ALL'],
    ['drop a trigger', 'DROP TRIGGER ledger_entries_append_only ON ledger_entries'],
    ['skip triggers with session_replication_role', 'SET session_replication_role = replica'],
    ['drop a table', 'DROP TABLE audit_logs'],
    ['create a table', 'CREATE TABLE evil (id int)'],
    ['add a column', 'ALTER TABLE users ADD COLUMN evil int'],
    ['create a function', "CREATE FUNCTION public.evil() RETURNS int AS 'SELECT 1' LANGUAGE sql"],
    ['TRUNCATE the ledger', 'TRUNCATE ledger_entries'],
    ['TRUNCATE users', 'TRUNCATE users'],
    ['DELETE ledger entries', 'DELETE FROM ledger_entries WHERE false'],
    ['DELETE transactions', 'DELETE FROM transactions WHERE false'],
    ['DELETE audit logs', 'DELETE FROM audit_logs WHERE false'],
    ['DELETE users', 'DELETE FROM users WHERE false'],
    ['DELETE accounts', 'DELETE FROM accounts WHERE false'],
    ['UPDATE a transaction', 'UPDATE transactions SET description = description WHERE false'],
    ['UPDATE a ledger entry', 'UPDATE ledger_entries SET amount = amount WHERE false'],
    ['UPDATE an audit record', 'UPDATE audit_logs SET reason = reason WHERE false'],
    ['read the migrations table', 'SELECT * FROM _prisma_migrations'],
    ['create a role', 'CREATE ROLE evil_role'],
    ['make itself superuser', `ALTER ROLE ${config.role} SUPERUSER`],
  ])('%s → refused', async (_, statement) => {
    await expect(prisma.$executeRawUnsafe(statement)).rejects.toThrow(DENIED);
  });

  test('…but what the app needs still works (expired idempotency keys, row locks)', async () => {
    await expect(prisma.$executeRawUnsafe('DELETE FROM idempotency_keys WHERE false')).resolves.toBe(0);
    await expect(prisma.$transaction((tx) => tx.$queryRawUnsafe('SELECT id FROM accounts LIMIT 1 FOR UPDATE'))).resolves.toBeDefined();
  });
});

describe('scripts/setup-db-roles.js', () => {
  test('re-running takes away a privilege that was granted by hand', async () => {
    await ownerDb().$executeRawUnsafe(`GRANT DELETE, TRUNCATE ON ledger_entries TO ${config.role}`);
    const before = await privilegeReport(prisma, config.role, ['ledger_entries']);
    expect(before.rows[0]).toMatchObject({ granted: ['SELECT', 'INSERT', 'DELETE', 'TRUNCATE'], matches: false });

    const after = await setupRoles(ownerDb(), config);
    expect(after.rows.every((r) => r.matches)).toBe(true);
    await expect(prisma.$executeRawUnsafe('DELETE FROM ledger_entries WHERE false')).rejects.toThrow(DENIED);
  });

  test('a table that is not in the privilege list → the script refuses (nothing is granted)', async () => {
    const table = `zz_unlisted_${crypto.randomUUID().slice(0, 8)}`;
    await ownerDb().$executeRawUnsafe(`CREATE TABLE ${table} (id int)`);
    try {
      await expect(setupRoles(ownerDb(), config)).rejects.toThrow(`not listed in scripts/setup-db-roles.js PRIVILEGES: ${table}`);
      await expect(prisma.$executeRawUnsafe(`SELECT * FROM ${table}`)).rejects.toThrow(DENIED);
    } finally {
      await ownerDb().$executeRawUnsafe(`DROP TABLE ${table}`);
    }
  });

  test('an API role that is a member of another role (e.g. neon_superuser) → the script refuses', async () => {
    const group = `zz_group_${crypto.randomUUID().slice(0, 8)}`;
    await ownerDb().$executeRawUnsafe(`CREATE ROLE ${group} NOLOGIN`);
    await ownerDb().$executeRawUnsafe(`GRANT ${group} TO ${config.role}`);
    try {
      await expect(setupRoles(ownerDb(), config)).rejects.toThrow(`is a member of ${group}`);
    } finally {
      await ownerDb().$executeRawUnsafe(`REVOKE ${group} FROM ${config.role}`);
      await ownerDb().$executeRawUnsafe(`DROP ROLE ${group}`);
    }
    expect((await setupRoles(ownerDb(), config)).rows.every((r) => r.matches)).toBe(true);
  });

  test.each([
    ['same role for both URLs', { DATABASE_URL: process.env.DIRECT_DATABASE_URL }, /different role/],
    ['short password', { DATABASE_URL: 'postgresql://ledgerline_api:short@localhost:5432/ledgerline_test' }, /24–128 characters/],
    ['different database', { DATABASE_URL: `postgresql://ledgerline_api:${'a'.repeat(30)}@localhost:5432/other` }, /same database/],
    ['missing owner URL', { DIRECT_DATABASE_URL: '' }, /Both DATABASE_URL/],
  ])('configuration mistake: %s → refused', (_, override, message) => {
    expect(() => parseUrls({ DATABASE_URL: process.env.DATABASE_URL, DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL, ...override })).toThrow(message);
  });
});

// Neon's control plane rejects pre-hashed passwords ("Neon only supports being given plaintext passwords"),
// found on the first production run – so Neon hosts get the plain password (over TLS), everything else the hash.
describe('password form: SCRAM hash locally, plain text (over TLS) only for Neon', () => {
  const password = 'Abc123'.repeat(5);

  test.each([
    ['ep-cool-name-123456.ap-southeast-1.aws.neon.tech', true],
    ['ep-cool-name-123456-pooler.us-east-2.aws.neon.tech', true],
    ['localhost', false],
    ['db.example.com', false],
    ['evilneon.tech', false],
    ['neon.tech.attacker.example', false],
  ])('%s → plain text: %s', (host, expected) => {
    expect(requiresPlaintextPassword(host)).toBe(expected);
  });

  test('parseUrls picks the form from the owner host, and refuses a Neon owner URL without sslmode=require', () => {
    const neon = (query) => ({
      DATABASE_URL: `postgresql://ledgerline_api:${password}@ep-x-1-pooler.aws.neon.tech/neondb?sslmode=require&pgbouncer=true`,
      DIRECT_DATABASE_URL: `postgresql://neondb_owner:owner@ep-x-1.aws.neon.tech/neondb${query}`,
    });
    expect(parseUrls(neon('?sslmode=require')).plaintextPassword).toBe(true);
    expect(() => parseUrls(neon(''))).toThrow(/sslmode=require/);
    expect(() => parseUrls(neon('?sslmode=disable'))).toThrow(/sslmode=require/);
    expect(config.plaintextPassword).toBe(false); // the local test database still gets the hash
  });

  test('the hash form never contains the password; the plain form is only ever a checked password', () => {
    const hashed = passwordLiteral(password, false);
    expect(hashed).toMatch(/^SCRAM-SHA-256\$4096:/);
    expect(hashed).not.toContain(password);
    expect(passwordLiteral(password, true)).toBe(password);
    expect(() => passwordLiteral("x'; DROP ROLE neondb_owner; --".padEnd(30, 'a'), true)).toThrow(/unchecked password/);
  });

  test('error messages never show the password or a connection string', async () => {
    expect(redact(`failed near '${password}' using postgresql://u:secret@host/db`, password)).toBe("failed near '<password hidden>' using <connection string hidden>");
    const failing = { $queryRaw: () => Promise.reject(new Error(`ROLE ... PASSWORD '${password}' (postgresql://neondb_owner:pw@h/neondb)`)) };
    const err = await setupRoles(failing, { ...config, password, plaintextPassword: true }).catch((e) => e);
    expect(err.message).not.toContain(password);
    expect(err.message).not.toMatch(/postgresql:\/\/|neondb_owner:pw/);
  });

  test('plain-text mode is accepted by PostgreSQL and leaves the role exactly as planned and able to log in', async () => {
    const other = crypto.randomBytes(24).toString('hex'); // a different, valid password
    const login = async (pw) => {
      const url = new URL(process.env.DATABASE_URL);
      url.password = pw;
      const client = new PrismaClient({ datasources: { db: { url: url.href } } });
      try {
        const [{ user }] = await client.$queryRaw`SELECT current_user AS "user"`;
        return user;
      } finally {
        await client.$disconnect();
      }
    };
    try {
      const report = await setupRoles(ownerDb(), { ...config, password: other, plaintextPassword: true });
      expect(report.rows.every((r) => r.matches)).toBe(true);
      await expect(login(other)).resolves.toBe(config.role);
      // Whether the OLD password is now refused can't be tested here: local pg_hba.conf usually uses "trust"
      // (no password check at all). Checked once by hand as superuser instead – see PROMPTS.md Entry 24.
    } finally {
      await setupRoles(ownerDb(), config); // back to the real password, hashed form
    }
    await expect(login(config.password)).resolves.toBe(config.role);
  });
});

// The second production run was cut off by Prisma's default 5 s transaction limit (Neon is ~130 ms per statement,
// and CREATE ROLE goes through its control plane) and rolled back.
describe('the role transaction is not cut off after Prisma\'s default 5 seconds', () => {
  test('a transaction that takes 6 s still commits, and the result is exactly as planned', async () => {
    const real = ownerDb();
    // Same connection, but every role transaction starts with a 6-second pause – like a slow network.
    const slow = new Proxy(real, {
      get: (target, prop) => (prop === '$transaction'
        ? (fn, options) => target.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SELECT pg_sleep(6)');
          return fn(tx);
        }, options)
        : target[prop]),
    });
    const report = await setupRoles(slow, config);
    expect(report.seconds).toBeGreaterThan(5.5);
    expect(report.rows.every((r) => r.matches)).toBe(true);
  }, 30_000);

  test('the limit is generous but finite', () => {
    expect(TRANSACTION_OPTIONS.timeout).toBeGreaterThanOrEqual(30_000);
    expect(TRANSACTION_OPTIONS.timeout).toBeLessThanOrEqual(120_000);
  });
});

