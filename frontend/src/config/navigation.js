import { ArrowDownIcon, ArrowUpIcon, BookIcon, HomeIcon, ListIcon, ShieldIcon, TransferIcon, UsersIcon, WalletIcon } from '../components/icons'
import { can } from './roles'

// Sidebar items. `permission` hides items the role can't use (UI only –
// the routes are also protected, and the backend enforces everything).
const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: HomeIcon },
  { to: '/accounts', label: 'Accounts', icon: WalletIcon },
  { to: '/transactions', label: 'Transactions', icon: ListIcon },
  { to: '/deposit', label: 'Deposit', icon: ArrowDownIcon, permission: 'transactions:create' },
  { to: '/withdraw', label: 'Withdraw', icon: ArrowUpIcon, permission: 'transactions:create' },
  { to: '/transfer', label: 'Transfer', icon: TransferIcon, permission: 'transactions:create' },
  { to: '/ledger', label: 'Ledger', icon: BookIcon, permission: 'ledger:read' },
  { to: '/audit-logs', label: 'Audit logs', icon: ShieldIcon, permission: 'audit:read' },
  { to: '/admin/users', label: 'Users', icon: UsersIcon, permission: 'users:manage' },
]

export function navItemsFor(role) {
  return NAV_ITEMS.filter((item) => !item.permission || can(role, item.permission))
}
