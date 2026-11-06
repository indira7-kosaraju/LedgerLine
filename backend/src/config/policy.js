// Business rules for money movement. All amounts in BigInt paise.

// The account that represents money outside LedgerLine (created by the seed).
const SYSTEM_ACCOUNT_NUMBER = 'LL-SYSTEM-EXTERNAL';

// Simulated deposits: at most ₹1,00,000 per deposit.
const MAX_DEPOSIT_PAISE = 10_000_000n;

// Withdrawals and transfers: at most ₹5,00,000 per transaction.
const MAX_WITHDRAWAL_PAISE = 50_000_000n;
const MAX_TRANSFER_PAISE = 50_000_000n;

module.exports = { SYSTEM_ACCOUNT_NUMBER, MAX_DEPOSIT_PAISE, MAX_WITHDRAWAL_PAISE, MAX_TRANSFER_PAISE };
