import { BookIcon, HomeIcon, ShieldIcon, WalletIcon } from '../components/icons'
import { can } from './roles'

// Sidebar items. `permission` hides items the role can't use (UI only –
// the routes are also protected, and the backend enforces everything).
const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: HomeIcon },
  { to: '/accounts', label: 'Accounts', icon: WalletIcon },
  { to: '/ledger', label: 'Ledger', icon: BookIcon, permission: 'ledger:read' },
  { to: '/audit-logs', label: 'Audit logs', icon: ShieldIcon, permission: 'audit:read' },
]

export function navItemsFor(role) {
  return NAV_ITEMS.filter((item) => !item.permission || can(role, item.permission))
}
