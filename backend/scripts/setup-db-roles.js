// Creates/updates the limited database role the API runs as, and gives it EXACTLY the
// privileges in PRIVILEGES below – nothing more. Safe to run any number of times.
//
//   npm run db:roles                  (local: backend/.env)
//   npm run db:roles -- --test        (backend/.env.test – run by scripts/prepare-test-db.js)
//   npm run db:roles -- --production  (backend/.env.production)
//
// Two connections, two roles:
//   DIRECT_DATABASE_URL – the OWNER of the tables. Runs migrations and this script. Never used by the API.
//   DATABASE_URL        – the API role (e.g. ledgerline_api). Role name and password are taken from this URL,
//                         so the role and the URL can never disagree.
//
// The API role can read and write ROWS only: no CREATE/ALTER/DROP, no TRUNCATE, no disabling triggers,
// no DELETE or UPDATE on history (transactions, ledger_entries, audit_logs), no role management.
// The password is sent to PostgreSQL as a SCRAM-SHA-256 hash computed here, so the server never sees it –
// EXCEPT on Neon: Neon's control plane rejects pre-hashed passwords ("Neon only supports being given plaintext
// passwords"), so for *.neon.tech hosts it is sent as plain text over the TLS connection and Neon hashes it.
// Either way it is removed from any error message before printing.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

// Every table in the public schema MUST be listed. An unlisted table makes this script fail,
// so a new migration can never leave a table with forgotten (or accidental) privileges.
const PRIVILEGES = Object.freeze({
  users: ['SELECT', 'INSERT', 'UPDATE'],
  accounts: ['SELECT', 'INSERT', 'UPDATE'],
  transactions: ['SELECT', 'INSERT'], // append-only history
  ledger_entries: ['SELECT', 'INSERT'], // append-only history
  audit_logs: ['SELECT', 'INSERT'], // append-only history
  idempotency_keys: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'], // DELETE: expired keys are replaced
  customer_profiles: ['SELECT', 'INSERT'], // onboarding profile: written once, never changed or deleted by the API
  _prisma_migrations: [], // migrations are the owner's job
});
const SEQUENCES = Object.freeze({ ledger_entries_entryNumber_seq: ['USAGE'] });
const ALL_TABLE_PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
// A safety cap, not the pool size. Each Prisma process opens a pool of about (2 × CPU cores + 1) connections
// unless DATABASE_URL sets ?connection_limit=… – set that on the deployed server (see docs/DEPLOYMENT.md).
// 20 was too low: the test suite's 40 simultaneous requests were refused with "too many connections".
const CONNECTION_LIMIT = 50;
// Prisma closes an interactive transaction after 5 s by default. Locally the role transaction takes milliseconds, but
// on Neon each of its ~15 statements is a network round trip (~130 ms) and CREATE ROLE goes through Neon's control
// plane – the first production run was cut off at 5 s and rolled back. It stays ONE transaction (all or nothing).
const TRANSACTION_OPTIONS = Object.freeze({ maxWait: 10_000, timeout: 60_000 });

const ROLE_NAME = /^[a-z_][a-z0-9_]{2,62}$/;
const PASSWORD = /^[A-Za-z0-9_-]{24,128}$/; // URL-safe, so it can sit in DATABASE_URL without encoding

// What PostgreSQL itself stores for "PASSWORD 'x'" with password_encryption = scram-sha-256 (RFC 5802/7677).
function scramVerifier(password) {
  const salt = crypto.randomBytes(16);
  const iterations = 4096;
  const salted = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const hmac = (key, text) => crypto.createHmac('sha256', key).update(text).digest();
  const storedKey = crypto.createHash('sha256').update(hmac(salted, 'Client Key')).digest();
  const serverKey = hmac(salted, 'Server Key');
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

function parseUrls({ DATABASE_URL, DIRECT_DATABASE_URL }) {
  if (!DATABASE_URL || !DIRECT_DATABASE_URL) throw new Error('Both DATABASE_URL (API role) and DIRECT_DATABASE_URL (owner) are required');
  const api = new URL(DATABASE_URL);
  const owner = new URL(DIRECT_DATABASE_URL);
  const role = decodeURIComponent(api.username);
  const password = decodeURIComponent(api.password);
  if (!ROLE_NAME.test(role)) throw new Error('The user name in DATABASE_URL must be a plain lowercase role name (e.g. ledgerline_api)');
  if (!PASSWORD.test(password)) throw new Error('The password in DATABASE_URL must be 24–128 characters of A–Z, a–z, 0–9, "_" or "-"');
  if (/change-me/i.test(password)) throw new Error('The password in DATABASE_URL is still the example value – generate a real one (see .env.example)');
  if (role === decodeURIComponent(owner.username)) throw new Error('DATABASE_URL must use a different role than DIRECT_DATABASE_URL (the owner)');
  if (api.pathname !== owner.pathname) throw new Error('DATABASE_URL and DIRECT_DATABASE_URL must point to the same database');
  if (requiresPlaintextPassword(owner.hostname) && !['require', 'verify-ca', 'verify-full'].includes(owner.searchParams.get('sslmode'))) {
    throw new Error('DIRECT_DATABASE_URL must have sslmode=require – the API password is sent to Neon as plain text, so TLS is mandatory');
  }
  return {
    role,
    password,
    database: owner.pathname.slice(1),
    ownerUrl: DIRECT_DATABASE_URL,
    plaintextPassword: requiresPlaintextPassword(owner.hostname),
  };
}

// Hosts whose control plane only accepts a plain-text password in CREATE/ALTER ROLE.
const requiresPlaintextPassword = (hostname) => /(^|\.)neon\.tech$/i.test(hostname);

// The PASSWORD '…' value. Both forms contain only characters that are safe inside single quotes
// (DDL can't take bind parameters): the password is limited by PASSWORD above, the verifier is base64/$/:.
function passwordLiteral(password, plaintext) {
  if (!PASSWORD.test(password)) throw new Error('refusing to put an unchecked password into SQL');
  if (plaintext) return password;
  const verifier = scramVerifier(password);
  if (!/^[A-Za-z0-9+/=$:-]+$/.test(verifier)) throw new Error('unexpected SCRAM verifier format');
  return verifier;
}

// Never let a password (or a URL containing one) reach the terminal through an error message.
function redact(message, password) {
  let text = String(message).replace(/postgres(ql)?:\/\/[^\s"']+/gi, '<connection string hidden>');
  if (password) text = text.split(password).join('<password hidden>');
  return text;
}

const quoteIdent = (name) => `"${name.replace(/"/g, '""')}"`;

// Runs as the OWNER. Returns the privilege report (what the role can do afterwards).
async function setupRoles(ownerDb, config) {
  try {
    return await applyRoles(ownerDb, config);
  } catch (err) {
    throw new Error(redact(err.message, config.password));
  }
}

async function applyRoles(ownerDb, { role, password, database, plaintextPassword = false }) {
  const r = quoteIdent(role);
  const [{ owner }] = await ownerDb.$queryRaw`SELECT current_user AS owner`;
  const tables = (await ownerDb.$queryRaw`SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`);

  const unlisted = tables.map((t) => t.tablename).filter((t) => !(t in PRIVILEGES));
  if (unlisted.length) throw new Error(`Table(s) not listed in scripts/setup-db-roles.js PRIVILEGES: ${unlisted.join(', ')} – decide their privileges first`);
  const notOwned = tables.filter((t) => t.tableowner !== owner).map((t) => t.tablename);
  if (notOwned.length) throw new Error(`DIRECT_DATABASE_URL must be the owner of all tables; not owned by ${owner}: ${notOwned.join(', ')}`);

  const started = Date.now();
  await ownerDb.$transaction(async (tx) => {
    const [existing] = await tx.$queryRaw`SELECT 1 AS found FROM pg_roles WHERE rolname = ${role}`;
    // Only a superuser may even *mention* SUPERUSER/REPLICATION/BYPASSRLS in ALTER ROLE, so re-runs set the
    // attributes the owner is allowed to change; privilegeReport() fails if the others were ever switched on.
    const attributes = existing
      ? `LOGIN NOCREATEDB NOCREATEROLE INHERIT CONNECTION LIMIT ${CONNECTION_LIMIT}`
      : `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT CONNECTION LIMIT ${CONNECTION_LIMIT}`;
    const secret = passwordLiteral(password, plaintextPassword);
    await tx.$executeRawUnsafe(`${existing ? 'ALTER' : 'CREATE'} ROLE ${r} ${existing ? '' : 'WITH'} ${attributes} PASSWORD '${secret}'`);

    // A role created in the Neon console is a member of neon_superuser – that would defeat the purpose.
    const memberships = await tx.$queryRaw`
      SELECT b.rolname FROM pg_auth_members m JOIN pg_roles b ON b.oid = m.roleid JOIN pg_roles u ON u.oid = m.member WHERE u.rolname = ${role}`;
    if (memberships.length) throw new Error(`${role} is a member of ${memberships.map((m) => m.rolname).join(', ')} – create it with this script, not in a dashboard`);

    await tx.$executeRawUnsafe(`GRANT CONNECT ON DATABASE ${quoteIdent(database)} TO ${r}`);
    await tx.$executeRawUnsafe(`REVOKE ALL ON SCHEMA public FROM ${r}`);
    await tx.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO ${r}`);

    // Reset, then grant exactly the list – so a privilege removed from the list is really taken away.
    await tx.$executeRawUnsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${r}`);
    await tx.$executeRawUnsafe(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${r}`);
    for (const [table, privileges] of Object.entries(PRIVILEGES)) {
      if (privileges.length && tables.some((t) => t.tablename === table)) {
        await tx.$executeRawUnsafe(`GRANT ${privileges.join(', ')} ON TABLE ${quoteIdent(table)} TO ${r}`);
      }
    }
    for (const [sequence, privileges] of Object.entries(SEQUENCES)) {
      await tx.$executeRawUnsafe(`GRANT ${privileges.join(', ')} ON SEQUENCE ${quoteIdent(sequence)} TO ${r}`);
    }
  }, TRANSACTION_OPTIONS);
  const seconds = (Date.now() - started) / 1000;

  return { ...(await privilegeReport(ownerDb, role, tables.map((t) => t.tablename))), seconds };
}

// What the role is ACTUALLY allowed to do, as PostgreSQL reports it, compared with PRIVILEGES.
async function privilegeReport(db, role, tables) {
  const rows = [];
  for (const table of tables) {
    const granted = [];
    for (const privilege of ALL_TABLE_PRIVILEGES) {
      const [{ ok }] = await db.$queryRaw`SELECT has_table_privilege(${role}, ${'public.' + table}, ${privilege}) AS ok`;
      if (ok) granted.push(privilege);
    }
    const expected = PRIVILEGES[table] ?? [];
    rows.push({ table, granted, matches: granted.join() === ALL_TABLE_PRIVILEGES.filter((p) => expected.includes(p)).join() });
  }
  const [attrs] = await db.$queryRaw`
    SELECT rolsuper, rolcreaterole, rolcreatedb, rolbypassrls, rolreplication, rolconnlimit,
           has_schema_privilege(${role}, 'public', 'CREATE') AS "schemaCreate",
           (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'public' AND tableowner = ${role}) AS "ownedTables"
    FROM pg_roles WHERE rolname = ${role}`;
  return { rows, attrs };
}

function printReport(role, { rows, attrs }) {
  console.log(`\nPrivileges of ${role} (as PostgreSQL reports them):`);
  for (const { table, granted, matches } of rows) console.log(`  ${matches ? '✅' : '❌'} ${table.padEnd(20)} ${granted.join(', ') || '(none)'}`);
  const limited = !attrs.rolsuper && !attrs.rolcreaterole && !attrs.rolcreatedb && !attrs.rolbypassrls && !attrs.rolreplication && !attrs.schemaCreate && attrs.ownedTables === 0;
  console.log(`  ${limited ? '✅' : '❌'} no superuser / CREATEROLE / CREATEDB / BYPASSRLS / REPLICATION, cannot create in schema, owns 0 tables; connection limit ${attrs.rolconnlimit}`);
  return limited && rows.every((r) => r.matches);
}

async function main() {
  const production = process.argv.includes('--production');
  const envFile = production ? '.env.production' : process.argv.includes('--test') ? '.env.test' : '.env';
  const file = path.join(__dirname, '..', envFile);
  if (!fs.existsSync(file)) throw new Error(`Missing ${path.relative(process.cwd(), file)}`);
  const config = parseUrls(dotenv.parse(fs.readFileSync(file)));
  const host = new URL(config.ownerUrl).hostname;
  if (production && /^(localhost|127\.0\.0\.1|::1)$/.test(host)) throw new Error('Refusing: .env.production points to this computer');
  if (/-pooler\./.test(host)) throw new Error('DIRECT_DATABASE_URL must be the DIRECT connection (host without "-pooler")');

  console.log(`Database: ${config.database} on ${host}${production ? ' (PRODUCTION)' : ''} – API role: ${config.role}`);
  console.log(`Password sent as: ${config.plaintextPassword ? 'plain text over TLS (Neon requires it; Neon stores a SCRAM hash)' : 'SCRAM-SHA-256 hash (computed here)'}`);
  const ownerDb = new PrismaClient({ datasources: { db: { url: config.ownerUrl } } });
  try {
    const report = await setupRoles(ownerDb, config);
    console.log(`Role and grants applied in one transaction in ${report.seconds.toFixed(1)} s (limit ${TRANSACTION_OPTIONS.timeout / 1000} s).`);
    const ok = printReport(config.role, report);
    console.log(ok ? `\n✅ ${config.role} has exactly the planned privileges.` : `\n❌ ${config.role} privileges differ from the plan.`);
    if (!ok) process.exitCode = 1;
  } finally {
    await ownerDb.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    // Hints for the two common first-time problems – never prints a URL or password.
    const hint = /permission denied to create role/i.test(err.message)
      ? '\n   The owner role needs CREATEROLE once. Locally: psql -d postgres -c "ALTER ROLE ledgerline_app CREATEROLE;"'
      : '';
    console.error(`❌ ${redact(err.message)}${hint}`);
    process.exitCode = 1;
  });
}

module.exports = { PRIVILEGES, SEQUENCES, TRANSACTION_OPTIONS, parseUrls, setupRoles, privilegeReport, requiresPlaintextPassword, passwordLiteral, redact };
