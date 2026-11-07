// Turns what the user types ("1,250.50") into whole paise ("125050") WITHOUT
// floating-point numbers: the decimal point is moved as TEXT, never by arithmetic.
// (In JavaScript 0.1 + 0.2 === 0.30000000000000004 – that must never touch money.)
//
// This is input parsing only. Whether the money can move (balance, limits,
// ownership, account status) is decided by the backend.

// Up to ₹9,99,99,999.99 with at most 2 decimal places. Real limits are enforced by the backend.
const AMOUNT_PATTERN = /^\d{1,8}(\.\d{1,2})?$/

const rupeeFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })

export function parseAmount(input) {
  const text = String(input ?? '').trim().replace(/,/g, '')
  if (!text) return { error: 'Enter an amount' }
  if (!AMOUNT_PATTERN.test(text)) return { error: 'Enter an amount like 500 or 1250.50 (at most 2 decimal places)' }

  const [rupees, fraction = ''] = text.split('.')
  // "1250" + "50" → "125050";  "7" + "5" padded → "750";  "0" + "00" → "000"
  const paise = (rupees + fraction.padEnd(2, '0')).replace(/^0+(?=\d)/, '')
  if (/^0+$/.test(paise)) return { error: 'Amount must be more than ₹0.00' }

  // Intl formats the decimal STRING exactly (no conversion to a binary float for display).
  return { paise, display: rupeeFormat.format(`${rupees}.${fraction.padEnd(2, '0')}`) }
}
