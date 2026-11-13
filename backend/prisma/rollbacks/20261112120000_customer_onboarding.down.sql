-- Emergency rollback of migration 20261112120000_customer_onboarding (step 4).
-- Use ONLY if the migration must be undone, and only while code WITHOUT step 4 is serving.
-- It removes onboarding data created after the migration (profiles, onboarding status/terms); users,
-- accounts, balances, transactions, ledger entries and audit records are not touched.
BEGIN;
DROP TRIGGER IF EXISTS "accounts_owner_onboarded" ON "accounts";
DROP FUNCTION IF EXISTS accounts_owner_onboarded();
DROP TRIGGER IF EXISTS "users_onboarding_requires_profile" ON "users";
DROP FUNCTION IF EXISTS users_onboarding_requires_profile();
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_onboarding_consistent";
DROP TABLE IF EXISTS "customer_profiles";
ALTER TABLE "users" DROP COLUMN IF EXISTS "onboardingStatus", DROP COLUMN IF EXISTS "onboardedAt",
  DROP COLUMN IF EXISTS "termsVersion", DROP COLUMN IF EXISTS "termsAcceptedAt";
DROP TYPE IF EXISTS "OnboardingStatus";
DROP TYPE IF EXISTS "Occupation";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261112120000_customer_onboarding';
COMMIT;
