import { Link } from 'react-router'
import { useApi } from '../../hooks/useApi'
import { listTransactions } from '../../api/transactions.api'
import { listAuditLogs, listLedgerEntries, verifyLedger, verifyAuditTrail } from '../../api/oversight.api'
import PageHeader from '../../components/ui/PageHeader'
import StatCard from '../../components/ui/StatCard'
import Badge from '../../components/ui/Badge'
import ErrorState from '../../components/ui/ErrorState'
import { Card, CardHeader } from '../../components/ui/Card'
import TransactionsTable from '../../components/domain/TransactionsTable'
import AuditLogTable from '../../components/domain/AuditLogTable'
import LedgerEntriesTable from '../../components/domain/LedgerEntriesTable'
import LedgerIntegrityCard from '../../components/domain/LedgerIntegrityCard'
import AuditIntegrityCard from '../../components/domain/AuditIntegrityCard'
import { AlertCircleIcon, BookIcon, CheckCircleIcon, ListIcon } from '../../components/icons'

function ViewAll({ to }) {
  return (
    <Link to={to} className="text-sm font-medium text-gold-soft hover:text-gold-bright">
      View all →
    </Link>
  )
}

// Read-only: auditors can look at everything but there are no buttons that change data.
export default function AuditorDashboard() {
  const transactions = useApi((opts) => listTransactions({ limit: 6 }, opts))
  const ledger = useApi((opts) => listLedgerEntries({ limit: 6 }, opts))
  const refusedTxns = useApi((opts) => listAuditLogs({ outcome: 'REFUSED', actionPrefix: 'TXN_', limit: 6 }, opts))
  const integrity = useApi((opts) => verifyLedger(opts))
  const auditIntegrity = useApi((opts) => verifyAuditTrail(opts))

  return (
    <>
      <PageHeader
        eyebrow="Auditor"
        title="Audit overview"
        description="Ledger records, transaction history and refused attempts."
        actions={<Badge tone="brand">Read-only access</Badge>}
      />

      <ErrorState error={transactions.error || ledger.error || refusedTxns.error} className="mb-6" />

      <AuditIntegrityCard result={auditIntegrity} variant="hero" />

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Transactions" icon={ListIcon} value={transactions.data?.total} />
        <StatCard label="Ledger entries" icon={BookIcon} value={ledger.data?.total} hint="2 per transaction" />
        <StatCard
          icon={AlertCircleIcon}
          label="Refused transaction attempts"
          value={refusedTxns.data?.total}
          tone={refusedTxns.data?.total ? 'danger' : 'default'}
        />
        <StatCard
          icon={CheckCircleIcon}
          label="Books"
          value={integrity.data ? (integrity.data.ok ? 'Balanced' : 'Problem') : undefined}
          tone={integrity.data ? (integrity.data.ok ? 'success' : 'danger') : 'default'}
          hint={integrity.data ? `Sum of balances ${integrity.data.sumOfAllBalances.formatted}` : undefined}
        />
      </div>

      <div className="mt-8 grid gap-6 2xl:grid-cols-3">
        <Card className="2xl:col-span-2">
          <CardHeader title="Refused transaction attempts" description="Deposits, withdrawals and transfers the system blocked" action={<ViewAll to="/audit-logs?outcome=REFUSED&category=TXN_" />} />
          <AuditLogTable items={refusedTxns.data?.items} loading={refusedTxns.loading} compact empty="No refused transaction attempts." />
        </Card>
        <div className="space-y-6">
          <LedgerIntegrityCard result={integrity} />
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Latest ledger records" description="Double-entry rows – every transaction writes one debit and one credit" action={<ViewAll to="/ledger" />} />
        <LedgerEntriesTable items={ledger.data?.items} loading={ledger.loading} compact />
      </Card>

      <Card className="mt-6">
        <CardHeader title="Transaction overview" description="Latest movements across all accounts" />
        <TransactionsTable items={transactions.data?.items} loading={transactions.loading} compact />
      </Card>
    </>
  )
}
