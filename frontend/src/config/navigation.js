import { ArrowDownIcon, ArrowUpIcon, BookIcon, CheckCircleIcon, HomeIcon, KeyIcon, ListIcon, ShieldIcon, TransferIcon, UserIcon, UsersIcon, WalletIcon } from '../components/icons'
import { can, needsOnboarding } from './roles'

// Sidebar items. `permission` hides items the role can't use (UI only –
// the routes are also protected, and the backend enforces everything).
const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: HomeIcon },
  // Only while onboarding is not finished (step 4)
  { to: '/onboarding', label: 'Onboarding', icon: CheckCircleIcon, permission: 'onboarding:own', show: needsOnboarding },
  { to: '/accounts', label: 'Accounts', icon: WalletIcon },
  { to: '/transactions', label: 'Transactions', icon: ListIcon },
  { to: '/deposit', label: 'Deposit', icon: ArrowDownIcon, permission: 'transactions:create' },
  { to: '/withdraw', label: 'Withdraw', icon: ArrowUpIcon, permission: 'transactions:create' },
  { to: '/transfer', label: 'Transfer', icon: TransferIcon, permission: 'transactions:create' },
  { to: '/ledger', label: 'Ledger', icon: BookIcon, permission: 'ledger:read' },
  { to: '/audit-logs', label: 'Audit logs', icon: ShieldIcon, permission: 'audit:read' },
  { to: '/admin/users', label: 'Users', icon: UsersIcon, permission: 'users:manage' },
  { to: '/admin/staff', label: 'Staff', icon: KeyIcon, permission: 'staff:manage' },
  { to: '/profile', label: 'Profile', icon: UserIcon },
]

export function navItemsFor(user) {
  return NAV_ITEMS.filter((item) => (!item.permission || can(user.role, item.permission)) && (!item.show || item.show(user)))
}
