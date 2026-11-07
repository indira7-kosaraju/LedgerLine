const { PrismaClient } = require('@prisma/client');
const env = require('./env');

// One shared PrismaClient for the whole app. Creating many clients
// would open many connection pools and exhaust PostgreSQL connections.
// Prisma always uses parameterized queries, which prevents SQL injection.
// Errors are NOT logged here: expected ones (e.g. duplicate email → 409) are handled
// in services, and unexpected ones are logged by middleware/errorHandler.js.
const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn'] : [],
});

module.exports = prisma;
