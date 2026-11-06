const { PrismaClient } = require('@prisma/client');
const env = require('./env');

// One shared PrismaClient for the whole app. Creating many clients
// would open many connection pools and exhaust PostgreSQL connections.
// Prisma always uses parameterized queries, which prevents SQL injection.
const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

module.exports = prisma;
