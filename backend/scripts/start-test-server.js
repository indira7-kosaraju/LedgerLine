// Starts the API with the TEST environment (.env.test → ledgerline_test, port 4001).
// Used by the Playwright browser tests. Refuses to start against any other database.
//
// Why a script and not "node -r dotenv/config … dotenv_config_path=.env.test"?
// That preload silently fell back to the real .env during Day 2 Task 8 – the browser
// tests would have run against real data. Loading the file explicitly and checking the
// database name makes that impossible.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.test'), override: true, quiet: true });

if (!/\/ledgerline_test\?/.test(process.env.DATABASE_URL || '')) {
  console.error('Refusing to start the test server: DATABASE_URL is not the ledgerline_test database.');
  process.exit(1);
}

require('../src/server');
