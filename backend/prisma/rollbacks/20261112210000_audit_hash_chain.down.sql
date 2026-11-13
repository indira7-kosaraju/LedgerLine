-- Emergency rollback of migration 20261112210000_audit_hash_chain (step 6).
-- Use ONLY while code WITHOUT step 6 is serving (step 6's readiness check requires the chain trigger).
-- Removes the chain columns, trigger and functions; the audit records themselves are not touched.
BEGIN;
DROP TRIGGER IF EXISTS "audit_logs_chain" ON "audit_logs";
DROP FUNCTION IF EXISTS audit_logs_chain();
DROP FUNCTION IF EXISTS audit_chain_problems(INTEGER);
DROP INDEX IF EXISTS "audit_logs_chainSeq_key";
ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "chainSeq", DROP COLUMN IF EXISTS "prevHash", DROP COLUMN IF EXISTS "hash";
DROP FUNCTION IF EXISTS audit_row_hash(TEXT, BIGINT, "audit_logs");
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261112210000_audit_hash_chain';
COMMIT;
