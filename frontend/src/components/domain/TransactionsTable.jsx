import { Link } from 'react-router'
import DataTable from '../ui/DataTable'
import { TransactionTypeBadge } from './StatusBadges'
import { formatDateTime } from '../../utils/format'
import { cn } from '../../utils/cn'

// From the viewer's point of view: money coming in (+), going out (−) or between
// their own accounts. Only decides the +/− label and colour – the amount itself is
// the backend's formatted value, never recalculated here.
function direction(txn, ownAccountIds) {
  if (!ownAccountIds) return 'neutral'
  const fromOwn = ownAccountIds.has(txn.fromAccount.id)
  const toOwn = ownAccountIds.has(txn.toAccount.id)
  if (fromOwn && toOwn) return 'internal'
  if (toOwn) return 'in'
  if (fromOwn) return 'out'
  return 'neutral'
}

function AccountRef({ account }) {
  return <span className="font-mono text-xs text-ink-2">{account.accountNumber ?? '—'}</span>
}

// ownAccountIds: Set of the viewer's account ids (account holders) – omit for admin/auditor.
// compact: hides reference + description so the amount stays visible in narrow dashboard cards.
export default function TransactionsTable({ items = [], loading, ownAccountIds, compact = false, empty = 'No transactions yet.' }) {
  const columns = [
    {
      key: 'createdAt',
      header: 'Date',
      // In compact mode the date is the link to the details page (the reference column is hidden).
      render: (t) =>
        compact ? (
          <Link to={`/transactions/${t.id}`} className="text-gold-soft hover:underline">
            {formatDateTime(t.createdAt)}
          </Link>
        ) : (
          <span className="text-ink-2">{formatDateTime(t.createdAt)}</span>
        ),
    },
    !compact && {
      key: 'reference',
      header: 'Reference',
      render: (t) => (
        <Link to={`/transactions/${t.id}`} className="font-mono text-xs font-medium text-gold-soft hover:underline">
          {t.reference}
        </Link>
      ),
    },
    { key: 'type', header: 'Type', render: (t) => <TransactionTypeBadge type={t.type} /> },
    {
      key: 'route',
      header: 'From → To',
      render: (t) => (
        <span className="inline-flex items-center gap-1.5">
          <AccountRef account={t.fromAccount} />
          <span className="text-ink-3">→</span>
          <AccountRef account={t.toAccount} />
        </span>
      ),
    },
    !compact && { key: 'description', header: 'Description', render: (t) => <span className="text-ink-3">{t.description ?? '—'}</span> },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (t) => {
        const d = direction(t, ownAccountIds)
        return (
          <span className={cn('font-medium tabular-nums', d === 'in' && 'text-success', d === 'out' && 'text-danger', d !== 'in' && d !== 'out' && 'text-ink')}>
            {d === 'in' ? '+' : d === 'out' ? '−' : ''}
            {t.amount.formatted}
          </span>
        )
      },
    },
  ].filter(Boolean)
  return <DataTable columns={columns} rows={items} loading={loading} empty={empty} caption="Transactions" />
}

export function AccountLink({ account }) {
  return (
    <Link to={`/accounts/${account.id}`} className="font-mono text-sm font-medium text-gold-soft hover:text-gold-bright hover:underline">
      {account.accountNumber}
    </Link>
  )
}
