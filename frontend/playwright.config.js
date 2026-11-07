import { defineConfig } from '@playwright/test'

// End-to-end tests in a real browser.   Run with: npm run test:e2e
//
// Playwright starts its OWN servers, separate from your dev servers:
//   • backend  on :4001 using backend/.env.test → the ledgerline_test database (never your real data)
//   • frontend on :5174 pointing at that backend
// It uses your installed Google Chrome (no browser download needed).
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.js',
  workers: 1, // tests share one database; run them one after another
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5174',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1400, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // Loads .env.test explicitly and refuses to run against any database but ledgerline_test.
      command: 'node scripts/start-test-server.js',
      cwd: '../backend',
      url: 'http://localhost:4001/api/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npx vite --port 5174 --strictPort',
      url: 'http://localhost:5174',
      env: { VITE_API_BASE_URL: 'http://localhost:4001/api' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
