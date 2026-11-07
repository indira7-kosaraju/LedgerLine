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
  return <span className="font-mono text-xs text-slate-600">{account.accountNumber ?? '—'}</span>
}

// ownAccountIds: Set of the viewer's account ids (account holders) – omit for admin/auditor.
// compact: hides reference + description so the amount stays visible in narrow dashboard cards.
export default function TransactionsTable({ items = [], loading, ownAccountIds, compact = false, empty = 'No transactions yet.' }) {
  const columns = [
    { key: 'createdAt', header: 'Date', render: (t) => <span className="text-slate-600">{formatDateTime(t.createdAt)}</span> },
    !compact && { key: 'reference', header: 'Reference', render: (t) => <span className="font-mono text-xs">{t.reference}</span> },
    { key: 'type', header: 'Type', render: (t) => <TransactionTypeBadge type={t.type} /> },
    {
      key: 'route',
      header: 'From → To',
      render: (t) => (
        <span className="inline-flex items-center gap-1.5">
          <AccountRef account={t.fromAccount} />
          <span className="text-slate-400">→</span>
          <AccountRef account={t.toAccount} />
        </span>
      ),
    },
    !compact && { key: 'description', header: 'Description', render: (t) => <span className="text-slate-500">{t.description ?? '—'}</span> },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (t) => {
        const d = direction(t, ownAccountIds)
        return (
          <span className={cn('font-medium tabular-nums', d === 'in' && 'text-emerald-700', d === 'out' && 'text-rose-700', d !== 'in' && d !== 'out' && 'text-slate-900')}>
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
    <Link to={`/accounts/${account.id}`} className="font-mono text-sm font-medium text-brand-700 hover:text-brand-800 hover:underline">
      {account.accountNumber}
    </Link>
  )
}
