import { useAuth } from '../hooks/useAuth'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import Badge from '../components/ui/Badge'

const ROLE_LABELS = { ADMIN: 'Administrator', ACCOUNT_HOLDER: 'Account holder', AUDITOR: 'Auditor' }

// Temporary landing page after sign-in. Replaced by role-based dashboards in Task 3.
export default function DashboardPage() {
  const { user } = useAuth()

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Card>
        <CardHeader title={`Welcome, ${user.fullName}`} description="You are signed in." />
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd className="mt-1 font-medium text-slate-900">{user.email}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Role</dt>
              <dd className="mt-1">
                <Badge tone="brand">{ROLE_LABELS[user.role] ?? user.role}</Badge>
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>
    </div>
  )
}
