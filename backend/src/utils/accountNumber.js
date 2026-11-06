const crypto = require('crypto');

// "LL" + 10 random digits, e.g. LL4829301746.
// crypto.randomInt is cryptographically secure, so numbers can't be predicted.
// Uniqueness is guaranteed by the database's unique constraint; the service
// retries on the (very unlikely) collision.
function generateAccountNumber() {
  let digits = '';
  for (let i = 0; i < 10; i++) digits += crypto.randomInt(0, 10);
  return `LL${digits}`;
}

module.exports = { generateAccountNumber };
