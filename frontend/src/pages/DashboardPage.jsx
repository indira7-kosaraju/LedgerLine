import { useAuth } from '../hooks/useAuth'
import AdminDashboard from './dashboard/AdminDashboard'
import AuditorDashboard from './dashboard/AuditorDashboard'
import HolderDashboard from './dashboard/HolderDashboard'

// One URL (/dashboard), a different dashboard per role. Each dashboard only calls
// APIs its role is allowed to use – and the backend would refuse anything else anyway.
export default function DashboardPage() {
  const { user } = useAuth()
  if (user.role === 'ADMIN') return <AdminDashboard />
  if (user.role === 'AUDITOR') return <AuditorDashboard />
  return <HolderDashboard />
}
