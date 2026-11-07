// Display helpers. Money is NEVER calculated here – the backend sends
// ready-made values like { paise: "550000", formatted: "₹5,500.00" }.

const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
const dateOnly = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' })

export const formatDateTime = (value) => (value ? dateTime.format(new Date(value)) : '—')
export const formatDate = (value) => (value ? dateOnly.format(new Date(value)) : '—')

// "INSUFFICIENT_FUNDS" → "Insufficient funds"
export function humanize(code) {
  if (!code) return '—'
  const text = code.toLowerCase().replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const ACTION_LABELS = {
  AUTH_LOGIN: 'Sign in',
  AUTH_LOGOUT: 'Sign out',
  AUTH_REGISTER: 'Registration',
  AUTHZ_DENIED: 'Permission check',
  CSRF_CHECK: 'CSRF check',
  TXN_DEPOSIT: 'Deposit',
  TXN_WITHDRAWAL: 'Withdrawal',
  TXN_TRANSFER: 'Transfer',
  ACCOUNT_CREATE: 'Open account',
  ACCOUNT_SET_STATUS: 'Account status change',
  ACCOUNT_VIEW: 'View account',
  ACCOUNT_MOVE_MONEY: 'Move money',
  ACCOUNT_MANAGE: 'Manage account',
  USER_SET_STATUS: 'User status change',
}

export const actionLabel = (action) => ACTION_LABELS[action] ?? humanize(action)
