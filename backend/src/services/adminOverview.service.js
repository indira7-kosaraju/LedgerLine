// The admin dashboard figures (GET /api/admin/overview, ADMIN only) – computed by PostgreSQL in one round of
// queries instead of several list requests from the browser. Counts and sums only, plus the latest sign-ups
// (public fields) and the latest administrative actions from the audit log. No personal details.
const prisma = require('../config/prisma');
const { toMoney } = require('../utils/money');
const { publicUserFields } = require('./auth.service');

// Audit actions that are administrative (shown as "Recent admin actions").
const ADMIN_ACTIONS = ['USER_SET_STATUS', 'USER_REVOKE_SESSIONS', 'USER_CHANGE_ROLE', 'STAFF_CREATE', 'ACCOUNT_SET_STATUS', 'ADMIN_BOOTSTRAP'];

async function getOverview() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [userGroups, pendingOnboarding, passwordChangePending, accountGroups, customerFunds, transactions, transactions24h, refused24h,
    recentSignups, recentAdminActions] = await Promise.all([
    prisma.user.groupBy({ by: ['role', 'isActive'], _count: true }),
    prisma.user.count({ where: { role: 'ACCOUNT_HOLDER', onboardingStatus: 'PENDING_PROFILE' } }),
    prisma.user.count({ where: { mustChangePassword: true } }),
    prisma.account.groupBy({ by: ['status'], where: { type: 'CUSTOMER' }, _count: true }),
    prisma.account.aggregate({ where: { type: 'CUSTOMER' }, _sum: { balance: true } }),
    prisma.transaction.count(),
    prisma.transaction.count({ where: { createdAt: { gte: since24h } } }),
    prisma.auditLog.count({ where: { outcome: 'REFUSED', createdAt: { gte: since24h } } }),
    prisma.user.findMany({ select: publicUserFields, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.auditLog.findMany({
      where: { action: { in: ADMIN_ACTIONS } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { actor: { select: { id: true, email: true, role: true } } },
    }),
  ]);

  const roles = { ADMIN: { active: 0, inactive: 0 }, AUDITOR: { active: 0, inactive: 0 }, ACCOUNT_HOLDER: { active: 0, inactive: 0 } };
  for (const g of userGroups) roles[g.role][g.isActive ? 'active' : 'inactive'] = g._count;
  const total = userGroups.reduce((n, g) => n + g._count, 0);
  const active = userGroups.filter((g) => g.isActive).reduce((n, g) => n + g._count, 0);
  const accounts = { ACTIVE: 0, FROZEN: 0, CLOSED: 0 };
  for (const g of accountGroups) accounts[g.status] = g._count;

  return {
    users: { total, active, inactive: total - active, byRole: roles, pendingOnboarding, passwordChangePending },
    accounts: { total: accounts.ACTIVE + accounts.FROZEN + accounts.CLOSED, active: accounts.ACTIVE, frozen: accounts.FROZEN, closed: accounts.CLOSED },
    customerFunds: toMoney(customerFunds._sum.balance ?? 0n),
    transactions: { total: transactions, last24h: transactions24h },
    refusedLast24h: refused24h,
    recentSignups,
    recentAdminActions,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { getOverview, ADMIN_ACTIONS };
