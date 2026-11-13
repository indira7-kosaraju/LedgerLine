-- Emergency rollback of migration 20261112180000_staff_management (step 5).
-- Use ONLY while code WITHOUT step 5 is serving (step 5's readiness check requires these triggers).
-- Removes the three triggers and the mustChangePassword column; no other data is touched.
-- After it, staff who had not yet changed their temporary password are no longer forced to – ask them to
-- change it on the Profile page.
BEGIN;
DROP TRIGGER IF EXISTS "users_keep_one_active_admin" ON "users";
DROP FUNCTION IF EXISTS users_keep_one_active_admin();
DROP TRIGGER IF EXISTS "accounts_owner_is_holder" ON "accounts";
DROP FUNCTION IF EXISTS accounts_owner_is_holder();
DROP TRIGGER IF EXISTS "users_role_transition" ON "users";
DROP FUNCTION IF EXISTS users_role_transition();
ALTER TABLE "users" DROP COLUMN IF EXISTS "mustChangePassword";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261112180000_staff_management';
COMMIT;
