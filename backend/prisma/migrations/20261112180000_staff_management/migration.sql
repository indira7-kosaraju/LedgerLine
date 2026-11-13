-- ═══════════════════════════════════════════════════════════════════
-- Step 5 – staff management.
-- Only ADDS things (one column, three triggers); no existing data is changed.
-- Rollback script: prisma/rollbacks/20261112180000_staff_management.down.sql
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Staff created by an admin get a temporary password and must change it first. ──
ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- ── 2. No role changes between account holders and staff. ──
--       A holder can never become ADMIN/AUDITOR (privilege escalation; staff must not own accounts),
--       and staff never become holders. Only ADMIN ↔ AUDITOR is possible.
CREATE OR REPLACE FUNCTION users_role_transition() RETURNS trigger AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role AND (OLD.role = 'ACCOUNT_HOLDER' OR NEW.role = 'ACCOUNT_HOLDER') THEN
    RAISE EXCEPTION 'Role change % → % is not allowed: account holders and staff are separate', OLD.role, NEW.role;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "users_role_transition"
  BEFORE UPDATE OF "role" ON "users"
  FOR EACH ROW EXECUTE FUNCTION users_role_transition();

-- ── 3. Customer accounts belong to account holders only (staff cannot hold money – separation of duties). ──
CREATE OR REPLACE FUNCTION accounts_owner_is_holder() RETURNS trigger AS $$
BEGIN
  IF NEW.type = 'CUSTOMER' AND NOT EXISTS (
       SELECT 1 FROM "users" u WHERE u.id = NEW."ownerId" AND u.role = 'ACCOUNT_HOLDER') THEN
    RAISE EXCEPTION 'Owner % is not an account holder: staff cannot own customer accounts', NEW."ownerId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "accounts_owner_is_holder"
  BEFORE INSERT ON "accounts"
  FOR EACH ROW EXECUTE FUNCTION accounts_owner_is_holder();

-- ── 4. The last active administrator cannot be deactivated or demoted. ──
--       Checked at COMMIT (deferred): replacing one admin with another in a single transaction is fine
--       (admin:bootstrap --replace-demo-admin), ending a transaction with no active admin is not.
--       Only fires when an active admin stops being one, so a fresh database (no admin yet) is unaffected.
CREATE OR REPLACE FUNCTION users_keep_one_active_admin() RETURNS trigger AS $$
BEGIN
  IF OLD.role = 'ADMIN' AND OLD."isActive" AND NOT (NEW.role = 'ADMIN' AND NEW."isActive")
     AND NOT EXISTS (SELECT 1 FROM "users" WHERE role = 'ADMIN' AND "isActive") THEN
    RAISE EXCEPTION 'At least one active administrator must remain';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "users_keep_one_active_admin"
  AFTER UPDATE OF "role", "isActive" ON "users"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION users_keep_one_active_admin();
