-- ═══════════════════════════════════════════════════════════════════
-- Step 6 – tamper-evident audit trail (hash chain).
-- Every audit record gets a gapless sequence number, the hash of the previous record and its own SHA-256 hash
-- over its content – all set by a trigger (the API cannot choose them). Changing, removing or reordering a
-- record afterwards (e.g. by someone with the owner password who switched the append-only trigger off) breaks
-- the chain, and audit_chain_problems() / GET /api/audit-logs/verify / verify-db report where.
-- Existing records are chained in their original order (createdAt, id); their content is not changed.
-- Rollback script: prisma/rollbacks/20261112210000_audit_hash_chain.down.sql
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE "audit_logs" ADD COLUMN "chainSeq" BIGINT, ADD COLUMN "prevHash" TEXT, ADD COLUMN "hash" TEXT;

-- The hash of one record: previous hash + an unambiguous JSON array of every content column.
-- (jsonb's text form is canonical; timestamps are written with millisecond precision, as stored.)
CREATE OR REPLACE FUNCTION audit_row_hash(prev_hash TEXT, seq BIGINT, r "audit_logs") RETURNS TEXT AS $$
  SELECT encode(sha256(convert_to(prev_hash || '|' || jsonb_build_array(
    seq, r.id, to_char(r."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS'), r."actorId", r.action, r.outcome::text,
    r."entityType", r."entityId", r.reason, r.metadata, r."ipAddress", r."userAgent")::text, 'UTF8')), 'hex')
$$ LANGUAGE sql STABLE;

-- ── 1. Chain the existing records (the append-only trigger is switched off for this one UPDATE only). ──
ALTER TABLE "audit_logs" DISABLE TRIGGER "audit_logs_append_only";
DO $$
DECLARE
  r "audit_logs";
  seq BIGINT := 0;
  prev TEXT := 'GENESIS';
  h TEXT;
BEGIN
  FOR r IN SELECT * FROM "audit_logs" ORDER BY "createdAt", id LOOP
    seq := seq + 1;
    h := audit_row_hash(prev, seq, r);
    UPDATE "audit_logs" SET "chainSeq" = seq, "prevHash" = prev, "hash" = h WHERE id = r.id;
    prev := h;
  END LOOP;
END $$;
ALTER TABLE "audit_logs" ENABLE TRIGGER "audit_logs_append_only";

ALTER TABLE "audit_logs" ALTER COLUMN "chainSeq" SET NOT NULL, ALTER COLUMN "prevHash" SET NOT NULL, ALTER COLUMN "hash" SET NOT NULL;
CREATE UNIQUE INDEX "audit_logs_chainSeq_key" ON "audit_logs"("chainSeq");

-- ── 2. New records: chained by the database at insert time, one at a time. ──
--       The advisory lock is held until COMMIT, so concurrent writers line up and the chain has no forks or gaps
--       (a rolled-back insert releases its number). Audit records are written last in every transaction, so the
--       lock is never held while waiting for another lock (no deadlocks). Values sent by the API are overwritten.
CREATE OR REPLACE FUNCTION audit_logs_chain() RETURNS trigger AS $$
DECLARE
  last_seq BIGINT;
  last_hash TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('ledgerline:audit-chain'));
  SELECT "chainSeq", "hash" INTO last_seq, last_hash FROM "audit_logs" ORDER BY "chainSeq" DESC LIMIT 1;
  NEW."createdAt" := date_trunc('milliseconds', NEW."createdAt");
  NEW."chainSeq" := COALESCE(last_seq, 0) + 1;
  NEW."prevHash" := COALESCE(last_hash, 'GENESIS');
  NEW."hash" := audit_row_hash(NEW."prevHash", NEW."chainSeq", NEW);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_chain"
  BEFORE INSERT ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_chain();

-- ── 3. Verification: every record must follow its predecessor (no gap), link to its hash, and still hash to
--       its stored value. Returns the first problems (empty = intact). Read-only; usable by the API role.
CREATE OR REPLACE FUNCTION audit_chain_problems(max_rows INTEGER DEFAULT 20)
RETURNS TABLE("chainSeq" BIGINT, problem TEXT) AS $$
  SELECT s, p FROM (
    SELECT a."chainSeq" AS s,
      CASE
        WHEN a."chainSeq" <> COALESCE(LAG(a."chainSeq") OVER w, 0) + 1 THEN 'records missing before this one (gap in the sequence)'
        WHEN a."prevHash" <> COALESCE(LAG(a."hash") OVER w, 'GENESIS') THEN 'does not link to the previous record'
        WHEN a."hash" <> audit_row_hash(a."prevHash", a."chainSeq", a) THEN 'content changed after it was written'
      END AS p
    FROM "audit_logs" a
    WINDOW w AS (ORDER BY a."chainSeq")
  ) x
  WHERE p IS NOT NULL
  ORDER BY s
  LIMIT max_rows
$$ LANGUAGE sql STABLE;
