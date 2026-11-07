import { Link } from 'react-router'
import { AccountStatusBadge } from './StatusBadges'
import { formatDate } from '../../utils/format'

export default function AccountCard({ account }) {
  return (
    <Link
      to={`/accounts/${account.id}`}
      className="group block rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-brand-300"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Account</p>
          <p className="mt-0.5 font-mono text-sm font-medium text-slate-900">{account.accountNumber}</p>
        </div>
        <AccountStatusBadge status={account.status} />
      </div>
      <p className="mt-4 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{account.balance.formatted}</p>
      <p className="mt-1 flex items-center justify-between text-xs text-slate-500">
        <span>Opened {formatDate(account.createdAt)}</span>
        <span className="font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">View statement →</span>
      </p>
    </Link>
  )
}
