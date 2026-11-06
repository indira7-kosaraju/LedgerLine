// Money helpers. All amounts are BigInt paise (1 rupee = 100 paise).
// No floating-point numbers are ever used here.

// Indian digit grouping: 1234567 → "12,34,567"
function groupIndian(digits) {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

// 500000n → "₹5,000.00"
function formatPaise(paise) {
  const value = BigInt(paise);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const rupees = (abs / 100n).toString();
  const rest = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}₹${groupIndian(rupees)}.${rest}`;
}

// The shape we send to clients for any money value.
// paise is a STRING because JSON numbers lose precision above 2^53.
function toMoney(paise, currency = 'INR') {
  return { paise: BigInt(paise).toString(), formatted: formatPaise(paise), currency };
}

module.exports = { formatPaise, toMoney };
