-- DropIndex
DROP INDEX "ledger_entries_accountId_createdAt_idx";

-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "entryNumber" BIGSERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_entryNumber_key" ON "ledger_entries"("entryNumber");

-- CreateIndex
CREATE INDEX "ledger_entries_accountId_entryNumber_idx" ON "ledger_entries"("accountId", "entryNumber");

