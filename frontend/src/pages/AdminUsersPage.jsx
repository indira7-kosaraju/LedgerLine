import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useApi } from '../hooks/useApi'
import { useToast } from '../hooks/useToast'
import { useQueryParams } from '../hooks/useQueryParams'
import { listUsers, updateUserStatus } from '../api/oversight.api'
import { ROLE_LABELS } from '../config/roles'
import { formatDate } from '../utils/format'
import PageHeader from '../components/ui/PageHeader'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import DataTable from '../components/ui/DataTable'
import Pagination from '../components/ui/Pagination'
import ErrorState from '../components/ui/ErrorState'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { Card } from '../components/ui/Card'

const LIMIT = 20

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'ACCOUNT_HOLDER', label: 'Account holders' },
  { value: 'ADMIN', label: 'Administrators' },
  { value: 'AUDITOR', label: 'Auditors' },
]
const ONBOARDING_OPTIONS = [
  { value: '', label: 'Any onboarding' },
  { value: 'PENDING_PROFILE', label: 'Onboarding pending' },
  { value: 'APPROVED', label: 'Onboarded' },
]
const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Deactivated' },
]

// ADMIN only. Deactivating a user signs them out everywhere at once: the backend
// re-checks isActive on every request, so their existing session stops working.
export default function AdminUsersPage() {
  const { user: me } = useAuth()
  const toast = useToast()
  const { get, page, update } = useQueryParams()
  const role = get('role')
  const status = get('status')
  const q = get('q')
  const onboarding = get('onboarding')
  const [search, setSearch] = useState(q)
  const [pending, setPending] = useState(null) // the user whose status is being changed
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const users = useApi((opts) => listUsers({ page, limit: LIMIT, role, status, onboarding, q }, opts), [page, role, status, onboarding, q])

  async function confirmChange() {
    setSaving(true)
    try {
      const updated = await updateUserStatus(pending.id, !pending.isActive, reason.trim())
      toast.success(`${updated.fullName} is now ${updated.isActive ? 'active' : 'deactivated'}.`)
      setPending(null)
      setReason('')
      users.reload()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'User',
      render: (u) => (
        <div>
          <Link to={`/admin/users/${u.id}`} className="font-medium text-slate-900 hover:text-brand-700">
            {u.fullName}
          </Link>{' '}
          {u.id === me.id && <span className="text-xs font-normal text-slate-500">(you)</span>}
          <p className="text-xs text-slate-500">{u.email}</p>
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (u) => <Badge tone={u.role === 'ACCOUNT_HOLDER' ? 'neutral' : 'brand'}>{ROLE_LABELS[u.role] ?? u.role}</Badge> },
    {
      key: 'status',
      header: 'Status',
      render: (u) => (u.isActive ? <Badge tone="success" dot>Active</Badge> : <Badge tone="danger" dot>Deactivated</Badge>),
    },
    {
      key: 'onboarding',
      header: 'Onboarding',
      render: (u) =>
        u.role !== 'ACCOUNT_HOLDER' ? (
          <span className="text-xs text-slate-400">—</span>
        ) : u.onboardingStatus === 'APPROVED' ? (
          <Badge tone="success">Onboarded</Badge>
        ) : (
          <Badge tone="warning">Pending</Badge>
        ),
    },
    { key: 'createdAt', header: 'Joined', render: (u) => <span className="text-slate-500">{formatDate(u.createdAt)}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      // The backend refuses self-changes too; hiding the button just avoids a pointless error.
      render: (u) =>
        u.id === me.id ? null : (
          <Button variant={u.isActive ? 'secondary' : 'primary'} size="sm" onClick={() => setPending(u)}>
            {u.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        ),
    },
  ]

  return (
    <>
      <PageHeader title="Users" description="Everyone who can sign in to LedgerLine." />
      <Card>
        <form
          className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            update({ q: search.trim() })
          }}
        >
          <Input label="Search" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" maxLength={64} />
          <Select label="Role" options={ROLE_OPTIONS} value={role} onChange={(e) => update({ role: e.target.value })} className="md:w-48" />
          <Select label="Status" options={STATUS_OPTIONS} value={status} onChange={(e) => update({ status: e.target.value })} className="md:w-44" />
          <Select label="Onboarding" options={ONBOARDING_OPTIONS} value={onboarding} onChange={(e) => update({ onboarding: e.target.value })} className="md:w-48" />
          <Button type="submit">Search</Button>
        </form>
        <ErrorState error={users.error} onRetry={users.reload} className="m-4" />
        <DataTable columns={columns} rows={users.data?.items} loading={users.loading} empty="No users match these filters." caption="Users" />
        <Pagination page={page} limit={LIMIT} total={users.data?.total} onPageChange={(p) => update({ page: p })} disabled={users.loading} />
      </Card>

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.isActive ? 'Deactivate user?' : 'Activate user?'}
        confirmLabel={pending?.isActive ? 'Deactivate' : 'Activate'}
        tone={pending?.isActive ? 'danger' : 'primary'}
        loading={saving}
        onConfirm={confirmChange}
        onCancel={() => {
          setPending(null)
          setReason('')
        }}
      >
        {pending && (
          <p>
            {pending.isActive ? (
              <>
                <strong className="text-slate-900">{pending.fullName}</strong> ({pending.email}) will be signed out immediately and will not be able to sign in.
                Their accounts and balances are not changed.
              </>
            ) : (
              <>
                <strong className="text-slate-900">{pending.fullName}</strong> ({pending.email}) will be able to sign in again.
              </>
            )}
          </p>
        )}
        <Input
          label="Reason (optional, stored in the audit log)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          className="mt-4"
        />
      </ConfirmDialog>
    </>
  )
}
