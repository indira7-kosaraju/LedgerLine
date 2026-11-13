import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useApi } from '../hooks/useApi'
import { useToast } from '../hooks/useToast'
import { getUserDetails, revokeSessions } from '../api/admin.api'
import { listAuditLogs, updateUserStatus } from '../api/oversight.api'
import { ROLE_LABELS } from '../config/roles'
import { formatDate, formatDateTime, humanize } from '../utils/format'
import PageHeader from '../components/ui/PageHeader'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import ErrorState from '../components/ui/ErrorState'
import FullPageSpinner from '../components/ui/FullPageSpinner'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import AuditLogTable from '../components/domain/AuditLogTable'

function Row({ label, children }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{children}</dd>
    </div>
  )
}

const ACTIONS = {
  deactivate: { title: 'Deactivate user?', label: 'Deactivate', tone: 'danger', text: 'They are signed out immediately and cannot sign in. Accounts and balances are not changed.' },
  activate: { title: 'Activate user?', label: 'Activate', tone: 'primary', text: 'They can sign in again (with a new session).' },
  revoke: { title: 'Sign out everywhere?', label: 'Sign out everywhere', tone: 'danger', text: 'Every current session ends at once; the user stays active and can sign in again.' },
}

// ADMIN: one user. Personal data is minimised by the server (age only, masked phone, no PIN code).
export default function AdminUserDetailsPage() {
  const { id } = useParams()
  const { user: me } = useAuth()
  const toast = useToast()
  const details = useApi((opts) => getUserDetails(id, opts), [id])
  const history = useApi((opts) => listAuditLogs({ entityId: id, limit: 10 }, opts), [id])
  const [pending, setPending] = useState(null) // 'deactivate' | 'activate' | 'revoke'
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  if (details.error) return <ErrorState error={details.error} onRetry={details.reload} />
  if (!details.data) return <FullPageSpinner label="Loading user…" />
  const { user, profile, accounts, activity } = details.data
  const isMe = user.id === me.id

  async function confirm() {
    setSaving(true)
    try {
      if (pending === 'revoke') {
        await revokeSessions(user.id, reason.trim())
        toast.success(`${user.fullName} was signed out everywhere.`)
      } else {
        await updateUserStatus(user.id, pending === 'activate', reason.trim())
        toast.success(`${user.fullName} is now ${pending === 'activate' ? 'active' : 'deactivated'}.`)
      }
      setPending(null)
      setReason('')
      details.reload()
      history.reload()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={<Link to="/admin/users" className="hover:text-brand-700">← Users</Link>}
        title={user.fullName}
        description={user.email}
        actions={
          !isMe && (
            <>
              <Button variant="secondary" onClick={() => setPending('revoke')} disabled={!user.isActive}>
                Sign out everywhere
              </Button>
              {user.isActive ? (
                <Button variant="danger" onClick={() => setPending('deactivate')}>
                  Deactivate
                </Button>
              ) : (
                <Button onClick={() => setPending('activate')}>Activate</Button>
              )}
            </>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Sign-in" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <Row label="Role">
                <Badge tone={user.role === 'ACCOUNT_HOLDER' ? 'neutral' : 'brand'}>{ROLE_LABELS[user.role] ?? user.role}</Badge>
                {user.role !== 'ACCOUNT_HOLDER' && (
                  <Link to="/admin/staff" className="ml-2 text-xs font-medium text-brand-600 hover:text-brand-700">
                    Change on the Staff page
                  </Link>
                )}
              </Row>
              <Row label="Status">{user.isActive ? <Badge tone="success" dot>Active</Badge> : <Badge tone="danger" dot>Deactivated</Badge>}</Row>
              {user.mustChangePassword && <Row label="Password">Temporary – must be changed at the next sign-in</Row>}
              <Row label="Joined">{formatDate(user.createdAt)}</Row>
              <Row label="Last successful sign-in">{activity.lastLoginAt ? formatDateTime(activity.lastLoginAt) : 'Never'}</Row>
              <Row label="Failed sign-ins (24 h)">{activity.failedLogins24h}</Row>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Onboarding profile" description="Demo data – shown minimised" />
          <CardBody>
            {user.role !== 'ACCOUNT_HOLDER' ? (
              <p className="text-sm text-slate-500">Staff members have no customer profile.</p>
            ) : !profile ? (
              <p className="text-sm text-slate-500">
                {user.onboardingStatus === 'APPROVED' ? 'Onboarded before profiles existed.' : 'Onboarding not completed yet.'}
              </p>
            ) : (
              <dl className="space-y-3 text-sm">
                <Row label="Age">{profile.age}</Row>
                <Row label="Mobile number">{profile.phone}</Row>
                <Row label="City / state">
                  {profile.city}, {profile.state}
                </Row>
                <Row label="Occupation">{humanize(profile.occupation)}</Row>
              </dl>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Money" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <Row label="Customer accounts">
                {accounts.total} ({accounts.active} active, {accounts.frozen} frozen, {accounts.closed} closed)
              </Row>
              <Row label="Total balance">{accounts.totalBalance.formatted}</Row>
              <Row label="Transactions started">{activity.transactions}</Row>
            </dl>
            {accounts.total > 0 && (
              <Link to={`/accounts?q=${encodeURIComponent(user.email)}`} className="mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
                View their accounts →
              </Link>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Administrative history" description="Audit records about this user" />
        <AuditLogTable items={history.data?.items} loading={history.loading} compact empty="No administrative actions for this user." />
      </Card>

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending && ACTIONS[pending].title}
        confirmLabel={pending && ACTIONS[pending].label}
        tone={pending && ACTIONS[pending].tone}
        loading={saving}
        onConfirm={confirm}
        onCancel={() => {
          setPending(null)
          setReason('')
        }}
      >
        <p>
          <strong className="text-slate-900">{user.fullName}</strong> ({user.email}): {pending && ACTIONS[pending].text}
        </p>
        <Input label="Reason (optional, stored in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className="mt-4" />
      </ConfirmDialog>
    </>
  )
}
