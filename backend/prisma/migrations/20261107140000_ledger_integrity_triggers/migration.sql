-- ═══════════════════════════════════════════════════════════════════
-- Ledger integrity enforced BY THE DATABASE (Day 2, Task 7).
-- Even a bug in the application, or someone with SQL access as the app user,
-- cannot write an unbalanced ledger or change history.
-- No schema (columns/tables) changes – triggers only.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Transactions are history: append-only, like ledger entries. ──
CREATE TRIGGER "transactions_append_only"
  BEFORE UPDATE OR DELETE ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- ── 2. Block TRUNCATE. Row-level triggers do NOT fire on TRUNCATE, so one
--       statement could otherwise wipe a whole table. ──
CREATE OR REPLACE FUNCTION prevent_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: TRUNCATE is not allowed', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entries_no_truncate" BEFORE TRUNCATE ON "ledger_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();
CREATE TRIGGER "audit_logs_no_truncate" BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();
CREATE TRIGGER "transactions_no_truncate" BEFORE TRUNCATE ON "transactions"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_truncate();

-- ── 3. Running-balance chain: every new entry must continue its account's total.
--       balanceAfter = previous balanceAfter (or 0) + amount (CREDIT) / − amount (DEBIT).
--       The account row is locked first, so concurrent inserts are checked in order. ──
CREATE OR REPLACE FUNCTION ledger_entry_check_chain() RETURNS trigger AS $$
DECLARE
  previous BIGINT;
  expected BIGINT;
BEGIN
  PERFORM 1 FROM "accounts" WHERE id = NEW."accountId" FOR UPDATE;

  SELECT "balanceAfter" INTO previous
  FROM "ledger_entries"
  WHERE "accountId" = NEW."accountId"
  ORDER BY "entryNumber" DESC
  LIMIT 1;

  expected := COALESCE(previous, 0) + CASE WHEN NEW.direction = 'CREDIT' THEN NEW.amount ELSE -NEW.amount END;

  IF NEW."balanceAfter" <> expected THEN
    RAISE EXCEPTION 'Ledger chain broken for account %: balanceAfter is % but must be %',
      NEW."accountId", NEW."balanceAfter", expected;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entries_check_chain"
  BEFORE INSERT ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION ledger_entry_check_chain();

-- ── 4. At COMMIT, an account's stored balance must equal its latest ledger balance.
--       Stops "money from nowhere" (UPDATE accounts SET balance = balance + …).
--       DEFERRED = checked when the transaction commits, after all its entries exist. ──
CREATE OR REPLACE FUNCTION account_balance_matches_ledger() RETURNS trigger AS $$
DECLARE
  current_balance BIGINT;
  ledger_balance BIGINT;
BEGIN
  SELECT balance INTO current_balance FROM "accounts" WHERE id = NEW.id;
  SELECT "balanceAfter" INTO ledger_balance
  FROM "ledger_entries"
  WHERE "accountId" = NEW.id
  ORDER BY "entryNumber" DESC
  LIMIT 1;

  IF current_balance IS DISTINCT FROM COALESCE(ledger_balance, 0) THEN
    RAISE EXCEPTION 'Balance of account % is % but the ledger says %',
      NEW.id, current_balance, COALESCE(ledger_balance, 0);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "accounts_balance_matches_ledger"
  AFTER UPDATE OF balance ON "accounts"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION account_balance_matches_ledger();

-- ── 5. At COMMIT, every new transaction must have exactly one DEBIT on its
--       "from" account and one CREDIT on its "to" account, both for its amount. ──
CREATE OR REPLACE FUNCTION transaction_is_balanced() RETURNS trigger AS $$
DECLARE
  matching_debits INT;
  matching_credits INT;
  total_entries INT;
BEGIN
  SELECT
    count(*) FILTER (WHERE direction = 'DEBIT'  AND "accountId" = NEW."fromAccountId" AND amount = NEW.amount),
    count(*) FILTER (WHERE direction = 'CREDIT' AND "accountId" = NEW."toAccountId"   AND amount = NEW.amount),
    count(*)
  INTO matching_debits, matching_credits, total_entries
  FROM "ledger_entries"
  WHERE "transactionId" = NEW.id;

  IF matching_debits <> 1 OR matching_credits <> 1 OR total_entries <> 2 THEN
    RAISE EXCEPTION 'Transaction % is not balanced: % matching debit(s), % matching credit(s), % entries',
      NEW.reference, matching_debits, matching_credits, total_entries;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "transactions_must_balance"
  AFTER INSERT ON "transactions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION transaction_is_balanced();
