import { Link } from 'react-router'
import { ArrowDownIcon, ArrowUpIcon, TransferIcon } from '../icons'

const ACTIONS = [
  { to: '/deposit', label: 'Deposit', text: 'Add simulated money', icon: ArrowDownIcon, tone: 'bg-emerald-50 text-emerald-700' },
  { to: '/withdraw', label: 'Withdraw', text: 'Take money out', icon: ArrowUpIcon, tone: 'bg-rose-50 text-rose-700' },
  { to: '/transfer', label: 'Transfer', text: 'Send to any account', icon: TransferIcon, tone: 'bg-brand-50 text-brand-700' },
]

// Shortcuts to the money pages. `accountId` preselects that account in the form.
export default function QuickActions({ accountId }) {
  const query = accountId ? `?account=${encodeURIComponent(accountId)}` : ''
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {ACTIONS.map(({ to, label, text, icon: Icon, tone }) => (
        <Link
          key={to}
          to={to + query}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-300"
        >
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
            <Icon />
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-900">{label}</span>
            <span className="block text-xs text-slate-500">{text}</span>
          </span>
        </Link>
      ))}
    </div>
  )
}
