// Step 4 – onboarding. Approval is AUTOMATIC: a valid profile (checked by onboarding.schemas.js) plus the
// current terms approves the account holder at once. The database enforces the same rules again
// (migration 20261112120000_customer_onboarding), so a bug here cannot approve without a profile.
const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const AppError = require('../utils/AppError');
const audit = require('./audit.service');
const { publicUserFields } = require('./auth.service');
const { TERMS_VERSION, MINIMUM_AGE, INDIAN_STATES, OCCUPATIONS } = require('../config/onboarding');

const requirements = Object.freeze({ termsVersion: TERMS_VERSION, minimumAge: MINIMUM_AGE, states: INDIAN_STATES, occupations: OCCUPATIONS });

const profileFields = { dateOfBirth: true, phone: true, city: true, state: true, pinCode: true, occupation: true, createdAt: true };

const toProfile = (p) => p && { ...p, dateOfBirth: p.dateOfBirth.toISOString().slice(0, 10) };

// The holder's own status and profile (and the rules the form must follow).
async function getOnboarding(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingStatus: true, onboardedAt: true, termsVersion: true, termsAcceptedAt: true, profile: { select: profileFields } },
  });
  return {
    status: user.onboardingStatus,
    onboardedAt: user.onboardedAt,
    termsAcceptedVersion: user.termsVersion,
    termsAcceptedAt: user.termsAcceptedAt,
    profile: toProfile(user.profile),
    requirements,
  };
}

async function submitOnboarding(userId, data, ctx) {
  const now = new Date();
  try {
    const user = await prisma.$transaction(async (tx) => {
      // Lock the user row: two submissions at the same moment are handled one after the other,
      // and the second one sees APPROVED.
      const [current] = await tx.$queryRaw`SELECT "onboardingStatus"::text AS status FROM "users" WHERE id = ${userId}::uuid FOR UPDATE`;
      if (current.status === 'APPROVED') {
        throw new AppError(409, 'Onboarding is already complete', 'ONBOARDING_ALREADY_COMPLETE');
      }
      await tx.customerProfile.create({
        data: {
          userId,
          dateOfBirth: new Date(`${data.dateOfBirth}T00:00:00Z`),
          phone: data.phone,
          city: data.city,
          state: data.state,
          pinCode: data.pinCode,
          occupation: data.occupation,
        },
      });
      const approved = await tx.user.update({
        where: { id: userId },
        data: { onboardingStatus: 'APPROVED', onboardedAt: now, termsVersion: data.termsVersion, termsAcceptedAt: now },
        select: publicUserFields,
      });
      // No personal details in the audit log – only what happened and under which terms.
      await audit.record(
        { actorId: userId, action: 'ONBOARDING_COMPLETE', outcome: 'SUCCESS', entityType: 'User', entityId: userId,
          metadata: { approval: 'AUTOMATIC', termsVersion: data.termsVersion }, ...ctx },
        tx
      );
      return approved;
    });
    return { user, onboarding: await getOnboarding(userId) };
  } catch (err) {
    const known = err instanceof AppError ? err
      : err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
        ? new AppError(409, 'Onboarding is already complete', 'ONBOARDING_ALREADY_COMPLETE')
        : null;
    if (!known) throw err;
    await audit.recordSafe({ actorId: userId, action: 'ONBOARDING_COMPLETE', outcome: 'REFUSED', reason: known.code, entityType: 'User', entityId: userId, ...ctx });
    throw known;
  }
}

module.exports = { getOnboarding, submitOnboarding, requirements };
