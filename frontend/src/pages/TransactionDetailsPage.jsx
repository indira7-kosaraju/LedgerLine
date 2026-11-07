import { Link, useParams } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useApi } from '../hooks/useApi'
import { getTransaction } from '../api/transactions.api'
import { can } from '../config/roles'
import { formatDateTime, humanize } from '../utils/format'
import { cn } from '../utils/cn'
import PageHeader from '../components/ui/PageHeader'
import Badge from '../components/ui/Badge'
import ErrorState from '../components/ui/ErrorState'
import FullPageSpinner from '../components/ui/FullPageSpinner'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { TransactionTypeBadge } from '../components/domain/StatusBadges'
import LedgerEntriesTable from '../components/domain/LedgerEntriesTable'

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{children}</dd>
    </div>
  )
}

// For account holders, the backend only returns ledger entries on THEIR accounts,
// so which entries came back tells us the direction: only a credit = money in,
// only a debit = money out, both = between their own accounts. No arithmetic.
function directionFromEntries(entries) {
  const hasCredit = entries.some((e) => e.direction === 'CREDIT')
  const hasDebit = entries.some((e) => e.direction === 'DEBIT')
  if (hasCredit && hasDebit) return 'internal'
  if (hasCredit) return 'in'
  if (hasDebit) return 'out'
  return 'neutral'
}

export default function TransactionDetailsPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const seesAll = can(user.role, 'transactions:read:any')
  const result = useApi((opts) => getTransaction(id, opts), [id])

  const back = (
    <Link to="/transactions" className="text-sm font-medium text-slate-500 hover:text-slate-700">
      ← Transactions
    </Link>
  )

  if (result.error) {
    return (
      <div className="max-w-xl space-y-4">
        {back}
        <ErrorState error={result.error} onRetry={result.reload} />
      </div>
    )
  }
  if (!result.data) return <FullPageSpinner label="Loading transaction…" />

  const { transaction: t, ledgerEntries, entriesHidden } = result.data
  const direction = seesAll ? 'neutral' : directionFromEntries(ledgerEntries)
  const ownAccountIds = new Set(ledgerEntries.map((e) => e.accountId))
  // Link to an account page only where the viewer can open it.
  const accountCell = (account) =>
    seesAll || ownAccountIds.has(account.id) ? (
      <Link to={`/accounts/${account.id}`} className="font-mono font-medium text-brand-700 hover:underline">
        {account.accountNumber}
      </Link>
    ) : (
      <span className="font-mono">{account.accountNumber}</span>
    )

  let initiatedBy = 'Another LedgerLine user'
  if (t.initiatedBy) initiatedBy = t.initiatedBy.id === user.id ? 'You' : `${t.initiatedBy.fullName} (${t.initiatedBy.email})`

  return (
    <>
      {back}
      <div className="mt-2">
        <PageHeader title={<span className="font-mono">{t.reference}</span>} description={`${humanize(t.type)} · ${formatDateTime(t.createdAt)}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-sm font-medium text-slate-500">Amount</p>
            <p
              className={cn(
                'mt-1 text-3xl font-semibold tabular-nums tracking-tight',
                direction === 'in' ? 'text-emerald-700' : direction === 'out' ? 'text-rose-700' : 'text-slate-900',
              )}
            >
              {direction === 'in' ? '+' : direction === 'out' ? '−' : ''}
              {t.amount.formatted}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <TransactionTypeBadge type={t.type} />
              <Badge tone={t.status === 'COMPLETED' ? 'success' : 'warning'} dot>
                {humanize(t.status)}
              </Badge>
              {direction === 'internal' && <Badge tone="neutral">Between your accounts</Badge>}
            </div>
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardBody>
            <dl className="grid gap-5 sm:grid-cols-2">
              <Detail label="From">{accountCell(t.fromAccount)}</Detail>
              <Detail label="To">{accountCell(t.toAccount)}</Detail>
              <Detail label="Initiated by">{initiatedBy}</Detail>
              <Detail label="Description">{t.description ?? '—'}</Detail>
              <Detail label="Transaction ID">
                <span className="break-all font-mono text-xs text-slate-600">{t.id}</span>
              </Detail>
              <Detail label="Date">{formatDateTime(t.createdAt)}</Detail>
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Ledger entries"
          description={seesAll ? 'Double entry: one debit and one credit of the same amount.' : 'The entries this transaction wrote on your accounts.'}
        />
        <LedgerEntriesTable items={ledgerEntries} showReference={false} compact />
        {entriesHidden > 0 && (
          <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            The other side of this transaction ({entriesHidden} entry on an account that isn&apos;t yours) is not shown, for privacy.
          </p>
        )}
      </Card>
    </>
  )
}
