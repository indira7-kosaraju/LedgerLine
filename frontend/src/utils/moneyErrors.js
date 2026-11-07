// Turns a failed money-movement request into a clear title + message.
// The backend's message is used as-is (it is safe to show); this adds a title.

const TITLES = {
  INSUFFICIENT_FUNDS: 'Not enough balance',
  ACCOUNT_NOT_ACTIVE: 'This account cannot move money',
  DESTINATION_NOT_FOUND: 'Destination account not found',
  DESTINATION_NOT_ACTIVE: 'Destination cannot receive money',
  AMOUNT_EXCEEDS_LIMIT: 'Amount is over the limit',
  SAME_ACCOUNT: 'Choose two different accounts',
  NOT_OWNER: 'Not your account',
  FORBIDDEN: 'Not allowed',
  VALIDATION_ERROR: 'Please check the form',
  RATE_LIMITED: 'Too many requests',
}

export function describeMoneyError(error) {
  // No answer from the server (network down, timeout, crash): we do NOT know
  // whether the money moved. Say so honestly instead of inviting a blind retry.
  if (error.status === 0 || error.status >= 500) {
    return {
      title: 'We could not confirm this transaction',
      message:
        'The server did not give a clear answer, so the transaction may or may not have gone through. ' +
        'Check your transaction history before trying again.',
      uncertain: true,
    }
  }
  return { title: TITLES[error.code] ?? 'Transaction refused', message: error.message, uncertain: false }
}

// Backend field names → form field names, for showing errors under the right input.
const FIELD_MAP = {
  amountPaise: 'amount',
  accountId: 'accountId',
  fromAccountId: 'accountId',
  toAccountId: 'destination',
  toAccountNumber: 'destination',
  description: 'description',
}

export function moneyFieldErrors(error) {
  const result = {}
  for (const { field, message } of error?.details ?? []) {
    const name = FIELD_MAP[field]
    if (name && !result[name]) result[name] = message
  }
  return result
}
