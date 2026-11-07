import DataTable from '../ui/DataTable'
import Badge from '../ui/Badge'
import { TransactionTypeBadge } from './StatusBadges'
import { formatDateTime } from '../../utils/format'

// Raw double-entry ledger rows. showAccount=false on an account statement
// (every row is the same account there). compact drops type, counterparty and
// entry columns for narrow dashboard cards – Debit/Credit already show the direction.
export default function LedgerEntriesTable({ items = [], loading, showAccount = true, compact = false, empty = 'No ledger entries yet.' }) {
  const columns = [
    { key: 'entryNumber', header: '#', render: (e) => <span className="font-mono text-xs text-slate-500">{e.entryNumber}</span> },
    { key: 'createdAt', header: 'Time', render: (e) => <span className="text-slate-600">{formatDateTime(e.createdAt)}</span> },
    showAccount && { key: 'accountNumber', header: 'Account', render: (e) => <span className="font-mono text-xs">{e.accountNumber}</span> },
    { key: 'reference', header: 'Reference', render: (e) => <span className="font-mono text-xs">{e.transaction?.reference}</span> },
    !compact && { key: 'type', header: 'Type', render: (e) => e.transaction && <TransactionTypeBadge type={e.transaction.type} /> },
    !compact && {
      key: 'counterparty',
      header: 'Counterparty',
      render: (e) => <span className="font-mono text-xs text-slate-500">{e.counterpartyAccountNumber ?? '—'}</span>,
    },
    !compact && {
      key: 'direction',
      header: 'Entry',
      render: (e) => (e.direction === 'CREDIT' ? <Badge tone="success">Credit</Badge> : <Badge tone="danger">Debit</Badge>),
    },
    {
      key: 'debit',
      header: 'Debit',
      align: 'right',
      render: (e) => (e.direction === 'DEBIT' ? <span className="tabular-nums text-rose-700">{e.amount.formatted}</span> : <span className="text-slate-300">—</span>),
    },
    {
      key: 'credit',
      header: 'Credit',
      align: 'right',
      render: (e) => (e.direction === 'CREDIT' ? <span className="tabular-nums text-emerald-700">{e.amount.formatted}</span> : <span className="text-slate-300">—</span>),
    },
    {
      key: 'balanceAfter',
      header: 'Balance after',
      align: 'right',
      render: (e) => <span className="font-medium tabular-nums text-slate-900">{e.balanceAfter.formatted}</span>,
    },
  ].filter(Boolean)

  return <DataTable columns={columns} rows={items} loading={loading} empty={empty} caption="Ledger entries" />
}
