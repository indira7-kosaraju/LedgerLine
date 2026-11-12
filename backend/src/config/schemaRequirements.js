// Database protections the app relies on (created by the migrations). Checked by the readiness endpoint
// (src/services/readiness.service.js) and by scripts/verify-db.js – one list, so the two can't drift apart.
const REQUIRED_TRIGGERS = Object.freeze([
  'ledger_entries_append_only', 'ledger_entries_no_truncate', 'ledger_entries_check_chain',
  'audit_logs_append_only', 'audit_logs_no_truncate',
  'transactions_append_only', 'transactions_no_truncate', 'transactions_must_balance',
  'accounts_balance_matches_ledger',
]);
const REQUIRED_CONSTRAINTS = Object.freeze([
  'accounts_customer_balance_non_negative', 'accounts_owner_matches_type', 'transactions_amount_positive',
  'ledger_entries_amount_positive', 'transactions_different_accounts',
]);

module.exports = { REQUIRED_TRIGGERS, REQUIRED_CONSTRAINTS };
