import { Link } from 'react-router'
import { ArrowDownIcon, ArrowUpIcon, ListIcon, TransferIcon } from '../icons'

const ACTIONS = [
  { to: '/deposit', label: 'Deposit', text: 'Add simulated money', icon: ArrowDownIcon, forAccount: true },
  { to: '/withdraw', label: 'Withdraw', text: 'Take money out', icon: ArrowUpIcon, forAccount: true },
  { to: '/transfer', label: 'Transfer', text: 'Send to any account', icon: TransferIcon, forAccount: true },
  // History is already on an account's own page, so it is only offered on the dashboard.
  { to: '/transactions', label: 'View history', text: 'All your transactions', icon: ListIcon, forAccount: false },
]

// Shortcuts to the money pages. `accountId` preselects that account in the form.
export default function QuickActions({ accountId }) {
  const query = accountId ? `?account=${encodeURIComponent(accountId)}` : ''
  const actions = accountId ? ACTIONS.filter((a) => a.forAccount) : ACTIONS
  return (
    <div className={accountId ? 'grid gap-3 sm:grid-cols-3' : 'grid grid-cols-2 gap-3 lg:grid-cols-4'}>
      {actions.map(({ to, label, text, icon: Icon, forAccount }) => (
        <Link
          key={to}
          to={forAccount ? to + query : to}
          className="surface-gradient group flex flex-col items-center gap-2 rounded-2xl border border-line px-4 py-5 text-center transition hover:-translate-y-0.5 hover:border-gold-line"
        >
          <span className="flex size-11 items-center justify-center rounded-xl border border-gold-deep/60 bg-gold-dark/50 text-gold-soft transition-colors group-hover:text-gold-bright">
            <Icon className="size-6" />
          </span>
          <span className="block text-sm font-semibold text-ink">{label}</span>
          <span className="block text-xs text-ink-3">{text}</span>
        </Link>
      ))}
    </div>
  )
}
