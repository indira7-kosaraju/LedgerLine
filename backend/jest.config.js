// Jest configuration. Run with: npm test
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  // Loads .env.test before any app code reads the environment.
  setupFiles: ['<rootDir>/tests/setup/env.js'],
  // Applies migrations + seed to the TEST database once before all tests.
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  // Integration tests share one database, so run test files one after another.
  maxWorkers: 1,
  testTimeout: 30000,
};
