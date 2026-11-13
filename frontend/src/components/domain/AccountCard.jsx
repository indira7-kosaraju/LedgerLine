import { Link } from 'react-router'
import { AccountStatusBadge } from './StatusBadges'
import { WalletIcon } from '../icons'
import { formatDate } from '../../utils/format'

export default function AccountCard({ account }) {
  return (
    <Link
      to={`/accounts/${account.id}`}
      className="surface-gradient group block rounded-2xl border border-line p-5 transition hover:border-gold-line"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-gold-deep/60 bg-gold-dark/50 text-gold-soft" aria-hidden="true">
            <WalletIcon />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Account</p>
            <p className="mt-0.5 font-mono text-sm font-medium text-ink">{account.accountNumber}</p>
          </div>
        </div>
        <AccountStatusBadge status={account.status} />
      </div>
      <p className="mt-5 text-2xl font-semibold tabular-nums tracking-tight text-ink">{account.balance.formatted}</p>
      <p className="mt-1 flex items-center justify-between text-xs text-ink-3">
        <span>Opened {formatDate(account.createdAt)}</span>
        <span className="font-medium text-gold-soft opacity-70 transition-opacity group-hover:opacity-100">View statement →</span>
      </p>
    </Link>
  )
}
