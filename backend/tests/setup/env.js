// Runs before each test file: use the TEST environment, never the real .env database.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.test'), override: true, quiet: true });

if (!/ledgerline_test/.test(process.env.DATABASE_URL || '')) {
  // Safety net: refuse to run tests that write data against a non-test database.
  throw new Error('Tests must use the ledgerline_test database (check backend/.env.test)');
}
