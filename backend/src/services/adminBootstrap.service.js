const bcrypt = require('bcrypt');
const { Prisma } = require('@prisma/client');

const prisma = require('../config/prisma');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const audit = require('./audit.service');
const { registerSchema } = require('../utils/schemas/auth.schemas');

// The public demo admin from prisma/seed-demo.js (password published in README.md).
const DEMO_ADMIN_EMAIL = 'demo.admin@example.com';

// Any constant works – both runs of the script must just use the same lock number.
const BOOTSTRAP_LOCK = 'ledgerline:first-admin-bootstrap';

const BOOTSTRAP_CTX = { ipAddress: null, userAgent: 'scripts/bootstrap-admin.js' };

// Creates the FIRST administrator. Used by `npm run admin:bootstrap`, never by an HTTP route.
//
// Rules:
// - Refuses if any ACTIVE admin exists – it can never be used to add a second admin.
//   (Deactivated admins don't count, so it can also recover a system with no working admin.)
// - Refuses if the email already belongs to a user – an existing user is never promoted.
// - Same email/name/password rules as registration.
// - replaceDemoAdmin: deactivates the public demo admin in the SAME transaction, so there is
//   never a moment with two admins or with none.
// - A transaction-level advisory lock makes two simultaneous runs wait for each other,
//   so exactly one admin can be created.
async function bootstrapFirstAdmin({ email, fullName, password, replaceDemoAdmin = false }) {
  const parsed = registerSchema.safeParse({ email, fullName, password });
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw new AppError(400, 'Validation failed', 'VALIDATION_ERROR', details);
  }
  const input = parsed.data;
  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS); // slow – done before taking the lock

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${BOOTSTRAP_LOCK}))`;

      let demoAdmin = null;
      if (replaceDemoAdmin) {
        demoAdmin = await tx.user.findFirst({ where: { email: DEMO_ADMIN_EMAIL, role: 'ADMIN', isActive: true }, select: { id: true } });
        if (demoAdmin) {
          await tx.user.update({
            where: { id: demoAdmin.id },
            // sessionVersion + 1 → tokens already issued to the demo admin stop working at once.
            data: { isActive: false, sessionVersion: { increment: 1 } },
          });
        }
      }
      const demoAdminDeactivated = Boolean(demoAdmin);

      const activeAdmins = await tx.user.count({ where: { role: 'ADMIN', isActive: true } });
      if (activeAdmins > 0) {
        const hint = replaceDemoAdmin ? '' : ' (use --replace-demo-admin if it is only the public demo admin)';
        throw new AppError(409, `An active admin already exists – bootstrap is only for the first admin${hint}`, 'ADMIN_ALREADY_EXISTS');
      }

      if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
        throw new AppError(409, 'A user with this email already exists – an existing user is never promoted', 'EMAIL_TAKEN');
      }

      const admin = await tx.user.create({
        data: { email: input.email, fullName: input.fullName, passwordHash, role: 'ADMIN' },
        select: { id: true, email: true, fullName: true, role: true, createdAt: true },
      });

      // Audit rows are part of the transaction: no admin without its audit trail.
      await audit.record(
        { action: 'ADMIN_BOOTSTRAP', outcome: 'SUCCESS', entityType: 'User', entityId: admin.id, metadata: { email: admin.email, demoAdminDeactivated }, ...BOOTSTRAP_CTX },
        tx
      );
      if (demoAdminDeactivated) {
        await audit.record(
          { action: 'USER_SET_STATUS', outcome: 'SUCCESS', entityType: 'User', entityId: demoAdmin.id, reason: 'DEMO_ADMIN_REPLACED', metadata: { email: DEMO_ADMIN_EMAIL, isActive: false }, ...BOOTSTRAP_CTX },
          tx
        );
      }

      return { admin, demoAdminDeactivated };
    });
  } catch (err) {
    const known = err instanceof AppError;
    // Two runs with the same email at once: the unique index catches the second one.
    const duplicate = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
    if (known || duplicate) {
      const reason = duplicate ? 'EMAIL_TAKEN' : err.code;
      await audit.recordSafe({ action: 'ADMIN_BOOTSTRAP', outcome: 'REFUSED', reason, metadata: { email: input.email }, ...BOOTSTRAP_CTX });
    }
    if (duplicate) throw new AppError(409, 'A user with this email already exists – an existing user is never promoted', 'EMAIL_TAKEN');
    throw err;
  }
}

module.exports = { bootstrapFirstAdmin, DEMO_ADMIN_EMAIL };
