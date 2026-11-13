import { Link } from 'react-router'
import { useApi } from '../../hooks/useApi'
import { listTransactions } from '../../api/transactions.api'
import { listAuditLogs, verifyLedger, verifyAuditTrail } from '../../api/oversight.api'
import { getOverview } from '../../api/admin.api'
import { ROLE_LABELS } from '../../config/roles'
import { formatDate } from '../../utils/format'
import PageHeader from '../../components/ui/PageHeader'
import StatCard from '../../components/ui/StatCard'
import Badge from '../../components/ui/Badge'
import ErrorState from '../../components/ui/ErrorState'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { buttonClasses } from '../../components/ui/buttonStyles'
import TransactionsTable from '../../components/domain/TransactionsTable'
import AuditLogTable from '../../components/domain/AuditLogTable'
import LedgerIntegrityCard from '../../components/domain/LedgerIntegrityCard'
import AuditIntegrityCard from '../../components/domain/AuditIntegrityCard'

// ADMIN home: one server-side overview (GET /api/admin/overview) plus the live ledger check,
// the latest money movements and the latest refusals.
export default function AdminDashboard() {
  const overview = useApi((opts) => getOverview(opts))
  const transactions = useApi((opts) => listTransactions({ limit: 8 }, opts))
  const refused = useApi((opts) => listAuditLogs({ outcome: 'REFUSED', limit: 6 }, opts))
  const integrity = useApi((opts) => verifyLedger(opts))
  const auditIntegrity = useApi((opts) => verifyAuditTrail(opts))

  const o = overview.data
  const firstError = overview.error || transactions.error || refused.error

  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="System overview"
        description="Users, staff, accounts and money movement across LedgerLine."
        actions={
          <>
            <Link to="/admin/users" className={buttonClasses('primary')}>
              Manage users
            </Link>
            <Link to="/admin/staff" className={buttonClasses('secondary')}>
              Manage staff
            </Link>
            <Link to="/accounts" className={buttonClasses('secondary')}>
              Accounts
            </Link>
          </>
        }
      />

      <ErrorState error={firstError} onRetry={overview.reload} className="mb-6" />

      <section aria-label="Users">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Users" value={o?.users.total} hint={o ? `${o.users.active} active · ${o.users.inactive} deactivated` : undefined} />
          <StatCard label="Account holders" value={o?.users.byRole.ACCOUNT_HOLDER.active} hint="Active" />
          <StatCard
            label="Onboarding pending"
            value={o?.users.pendingOnboarding}
            hint="Registered, profile not yet submitted"
            tone={o?.users.pendingOnboarding ? 'warning' : 'default'}
          />
          <StatCard
            label="Staff"
            value={o ? o.users.byRole.ADMIN.active + o.users.byRole.AUDITOR.active : undefined}
            hint={o ? `${o.users.byRole.ADMIN.active} admins · ${o.users.byRole.AUDITOR.active} auditors${o.users.passwordChangePending ? ` · ${o.users.passwordChangePending} temporary password` : ''}` : undefined}
          />
        </div>
      </section>

      <section aria-label="Money" className="mt-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Customer accounts" value={o?.accounts.total} hint={o ? `${o.accounts.active} active · ${o.accounts.frozen} frozen · ${o.accounts.closed} closed` : undefined} />
          <StatCard label="Customer funds" value={o?.customerFunds.formatted} hint="Sum of all customer balances" />
          <StatCard label="Transactions" value={o?.transactions.total} hint={o ? `${o.transactions.last24h} in the last 24 hours` : undefined} />
          <StatCard label="Refused attempts" value={o?.refusedLast24h} hint="Last 24 hours" tone={o?.refusedLast24h ? 'danger' : 'default'} />
        </div>
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Recent admin actions"
            description="Status and role changes, new staff, account freezes"
            action={
              <Link to="/audit-logs" className="text-sm font-medium text-brand-600 hover:text-brand-700">
                Audit log →
              </Link>
            }
          />
          <AuditLogTable items={o?.recentAdminActions} loading={overview.loading} compact empty="No admin actions yet." />
        </Card>
        <Card>
          <CardHeader title="Newest users" description="The latest sign-ups and staff accounts" />
          <CardBody>
            {!o ? (
              <div className="h-24 animate-pulse rounded bg-slate-100" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {o.recentSignups.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <Link to={`/admin/users/${u.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {u.fullName}
                      </Link>
                      <p className="truncate text-xs text-slate-500">{u.email}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {u.role === 'ACCOUNT_HOLDER' && u.onboardingStatus !== 'APPROVED' && <Badge tone="warning">Onboarding</Badge>}
                      <Badge tone={u.role === 'ACCOUNT_HOLDER' ? 'neutral' : 'brand'}>{ROLE_LABELS[u.role] ?? u.role}</Badge>
                      <span className="text-xs text-slate-500">{formatDate(u.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 2xl:grid-cols-3">
        <Card className="2xl:col-span-2">
          <CardHeader title="Transaction overview" description="Latest movements across all accounts" />
          <TransactionsTable items={transactions.data?.items} loading={transactions.loading} compact />
        </Card>
        <div className="space-y-6">
          <LedgerIntegrityCard result={integrity} />
          <AuditIntegrityCard result={auditIntegrity} />
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Recent refused attempts"
          description="Actions the system blocked"
          action={
            <Link to="/audit-logs?outcome=REFUSED" className="text-sm font-medium text-brand-600 hover:text-brand-700">
              View all →
            </Link>
          }
        />
        <AuditLogTable items={refused.data?.items} loading={refused.loading} compact empty="No refused attempts." />
      </Card>
    </>
  )
}
