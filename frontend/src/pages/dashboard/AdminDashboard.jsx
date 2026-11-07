import { Link } from 'react-router'
import { useApi } from '../../hooks/useApi'
import { listAccounts } from '../../api/accounts.api'
import { listTransactions } from '../../api/transactions.api'
import { listAuditLogs, listUsers, verifyLedger } from '../../api/oversight.api'
import PageHeader from '../../components/ui/PageHeader'
import StatCard from '../../components/ui/StatCard'
import ErrorState from '../../components/ui/ErrorState'
import { Card, CardHeader } from '../../components/ui/Card'
import { buttonClasses } from '../../components/ui/buttonStyles'
import TransactionsTable from '../../components/domain/TransactionsTable'
import AuditLogTable from '../../components/domain/AuditLogTable'
import LedgerIntegrityCard from '../../components/domain/LedgerIntegrityCard'

export default function AdminDashboard() {
  // limit: 1 – we only need the `total` count from these lists.
  const users = useApi((opts) => listUsers({ limit: 1 }, opts))
  const accounts = useApi((opts) => listAccounts({ type: 'CUSTOMER', limit: 1 }, opts))
  const transactions = useApi((opts) => listTransactions({ limit: 8 }, opts))
  const refused = useApi((opts) => listAuditLogs({ outcome: 'REFUSED', limit: 6 }, opts))
  const integrity = useApi((opts) => verifyLedger(opts))

  const firstError = users.error || accounts.error || transactions.error || refused.error

  return (
    <>
      <PageHeader
        eyebrow="Administrator"
        title="System overview"
        description="Users, accounts and money movement across LedgerLine."
        actions={
          <>
            <Link to="/accounts" className={buttonClasses('primary')}>
              Manage accounts
            </Link>
            <Link to="/audit-logs" className={buttonClasses('secondary')}>
              Audit logs
            </Link>
          </>
        }
      />

      <ErrorState error={firstError} className="mb-6" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total users" value={users.data?.total} />
        <StatCard label="Customer accounts" value={accounts.data?.total} />
        <StatCard label="Customer funds" value={accounts.data?.summary.totalBalance.formatted} hint="Sum of all customer balances" />
        <StatCard label="Total transactions" value={transactions.data?.total} />
        <StatCard label="Refused attempts" value={refused.data?.total} tone={refused.data?.total ? 'danger' : 'default'} hint="All time" />
      </div>

      <div className="mt-8 grid gap-6 2xl:grid-cols-3">
        <Card className="2xl:col-span-2">
          <CardHeader title="Transaction overview" description="Latest movements across all accounts" />
          <TransactionsTable items={transactions.data?.items} loading={transactions.loading} compact />
        </Card>
        <LedgerIntegrityCard result={integrity} />
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
