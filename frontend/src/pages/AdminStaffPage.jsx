import { useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useApi } from '../hooks/useApi'
import { useToast } from '../hooks/useToast'
import { useQueryParams } from '../hooks/useQueryParams'
import { changeStaffRole, createStaff, listStaff } from '../api/admin.api'
import { ROLE_LABELS } from '../config/roles'
import { fieldErrorsFromApi, validateStaff } from '../utils/validation'
import { formatDate } from '../utils/format'
import PageHeader from '../components/ui/PageHeader'
import Input from '../components/ui/Input'
import PasswordInput from '../components/ui/PasswordInput'
import Select from '../components/ui/Select'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import Alert from '../components/ui/Alert'
import DataTable from '../components/ui/DataTable'
import Pagination from '../components/ui/Pagination'
import ErrorState from '../components/ui/ErrorState'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { Card } from '../components/ui/Card'
import { PlusIcon } from '../components/icons'

const LIMIT = 20
const STAFF_ROLES = [
  { value: 'AUDITOR', label: 'Auditor – read-only access to everything' },
  {
    value: 'ADMIN',
    label: 'Administrator – manages users, staff and accounts',
  },
]
const ROLE_FILTER = [
  { value: '', label: 'All staff' },
  { value: 'ADMIN', label: 'Administrators' },
  { value: 'AUDITOR', label: 'Auditors' },
]
const NEW_STAFF = {
  fullName: '',
  email: '',
  role: 'AUDITOR',
  currentPassword: '',
}

// ADMIN only. Administrators and auditors – never account holders (the backend and the database refuse that).
export default function AdminStaffPage() {
  const { user: me } = useAuth()
  const toast = useToast()
  const { get, page, update } = useQueryParams()
  const role = get('role')
  const q = get('q')
  const [search, setSearch] = useState(q)
  const staff = useApi((opts) => listStaff({ page, limit: LIMIT, role, q }, opts), [page, role, q])

  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(NEW_STAFF)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState(null) // { user, temporaryPassword } – shown once
  const [roleChange, setRoleChange] = useState(null) // { user, role, currentPassword, reason }

  const onForm = (event) => {
    const { name, value } = event.target
    setForm((f) => ({ ...f, [name]: value }))
    setErrors((e) => ({ ...e, [name]: undefined }))
  }

  async function submitCreate() {
    const found = validateStaff(form)
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    try {
      const result = await createStaff({
        ...form,
        fullName: form.fullName.trim(),
        email: form.email.trim(),
      })
      setCreating(false)
      setForm(NEW_STAFF)
      setCreated(result)
      staff.reload()
    } catch (error) {
      const fieldErrors = fieldErrorsFromApi(error)
      if (error.code === 'EMAIL_TAKEN') fieldErrors.email = error.message
      setErrors(fieldErrors)
      if (!Object.keys(fieldErrors).length) toast.error(error.message)
      setForm((f) => ({ ...f, currentPassword: '' }))
    } finally {
      setSaving(false)
    }
  }

  async function submitRoleChange() {
    if (!roleChange.currentPassword) {
      setErrors({ roleChangePassword: 'Enter your password to confirm' })
      return
    }
    setSaving(true)
    try {
      const updated = await changeStaffRole(roleChange.user.id, {
        role: roleChange.role,
        currentPassword: roleChange.currentPassword,
        reason: roleChange.reason.trim(),
      })
      toast.success(`${updated.fullName} is now ${ROLE_LABELS[updated.role]}. Their sessions were ended.`)
      setRoleChange(null)
      staff.reload()
    } catch (error) {
      const fieldErrors = fieldErrorsFromApi(error)
      if (fieldErrors.currentPassword) setErrors({ roleChangePassword: fieldErrors.currentPassword })
      else toast.error(error.message)
      setRoleChange((r) => r && { ...r, currentPassword: '' })
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'Staff member',
      render: (u) => (
        <div>
          <Link to={`/admin/users/${u.id}`} className="font-medium text-ink hover:text-gold-bright">
            {u.fullName}
          </Link>{' '}
          {u.id === me.id && <span className="text-xs text-ink-3">(you)</span>}
          <p className="text-xs text-ink-3">{u.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (u) => <Badge tone="brand">{ROLE_LABELS[u.role] ?? u.role}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => (
        <div className="flex flex-wrap gap-1.5">
          {u.isActive ? (
            <Badge tone="success" dot>
              Active
            </Badge>
          ) : (
            <Badge tone="danger" dot>
              Deactivated
            </Badge>
          )}
          {u.mustChangePassword && <Badge tone="warning">Temporary password</Badge>}
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Since',
      render: (u) => <span className="text-ink-3">{formatDate(u.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      // Nobody changes their own role (the backend refuses it too).
      render: (u) =>
        u.id === me.id ? null : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setErrors({})
              setRoleChange({
                user: u,
                role: u.role === 'ADMIN' ? 'AUDITOR' : 'ADMIN',
                currentPassword: '',
                reason: '',
              })
            }}
          >
            {u.role === 'ADMIN' ? 'Make auditor' : 'Make administrator'}
          </Button>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Staff"
        description="Administrators and auditors. Account holders can never become staff."
        actions={
          <Button
            onClick={() => {
              setErrors({})
              setCreating(true)
            }}
          >
            <PlusIcon className="size-4" /> Add staff member
          </Button>
        }
      />

      <Card>
        <form
          className="flex flex-col gap-3 border-b border-line-soft p-4 md:flex-row md:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            update({ q: search.trim() })
          }}
        >
          <Input label="Search" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} className="flex-1" maxLength={64} />
          <Select label="Role" options={ROLE_FILTER} value={role} onChange={(e) => update({ role: e.target.value })} className="md:w-56" />
          <Button type="submit">Search</Button>
        </form>
        <ErrorState error={staff.error} onRetry={staff.reload} className="m-4" />
        <DataTable columns={columns} rows={staff.data?.items} loading={staff.loading} empty="No staff members match." caption="Staff" />
        <Pagination page={page} limit={LIMIT} total={staff.data?.total} onPageChange={(p) => update({ page: p })} disabled={staff.loading} />
      </Card>

      {/* Create */}
      <ConfirmDialog
        open={creating}
        title="Add staff member"
        confirmLabel="Create staff account"
        loading={saving}
        onConfirm={submitCreate}
        onCancel={() => {
          setCreating(false)
          setForm(NEW_STAFF)
        }}
      >
        {creating && (
          <div className="space-y-4">
            <Input label="Full name" name="fullName" value={form.fullName} onChange={onForm} error={errors.fullName} autoComplete="off" />
            <Input label="Email" name="email" type="email" value={form.email} onChange={onForm} error={errors.email} autoComplete="off" />
            <Select label="Role" name="role" options={STAFF_ROLES} value={form.role} onChange={onForm} error={errors.role} />
            <PasswordInput
              label="Your password (to confirm)"
              name="currentPassword"
              value={form.currentPassword}
              onChange={onForm}
              error={errors.currentPassword}
              autoComplete="current-password"
            />
            <p className="text-xs text-ink-3">
              A temporary password is generated and shown once. The new staff member must change it at the first sign-in.
            </p>
          </div>
        )}
      </ConfirmDialog>

      {/* The temporary password – once */}
      <ConfirmDialog
        open={Boolean(created)}
        title="Staff account created"
        confirmLabel="I have handed it over"
        onConfirm={() => setCreated(null)}
        onCancel={() => setCreated(null)}
      >
        {created && (
          <div className="space-y-3">
            <p>
              <strong className="text-ink">{created.user.fullName}</strong> ({created.user.email}) is now {ROLE_LABELS[created.user.role]}.
            </p>
            <Alert tone="warning" title="Temporary password – shown only now">
              <code className="block select-all break-all rounded bg-card px-2 py-1 font-mono text-base text-ink" data-testid="temporary-password">
                {created.temporaryPassword}
              </code>
              <span className="mt-2 block">
                Give it to them in person or through a secure channel. It is not stored anywhere in readable form and cannot be shown again.
              </span>
            </Alert>
          </div>
        )}
      </ConfirmDialog>

      {/* Role change */}
      <ConfirmDialog
        open={Boolean(roleChange)}
        title="Change role?"
        confirmLabel={roleChange?.role === 'ADMIN' ? 'Make administrator' : 'Make auditor'}
        tone={roleChange?.role === 'ADMIN' ? 'primary' : 'danger'}
        loading={saving}
        onConfirm={submitRoleChange}
        onCancel={() => setRoleChange(null)}
      >
        {roleChange && (
          <div className="space-y-4">
            <p>
              <strong className="text-ink">{roleChange.user.fullName}</strong> becomes <strong>{ROLE_LABELS[roleChange.role]}</strong>. All of their
              current sessions end.
            </p>
            <Input
              label="Reason (optional, stored in the audit log)"
              value={roleChange.reason}
              onChange={(e) => setRoleChange((r) => ({ ...r, reason: e.target.value }))}
              maxLength={200}
            />
            <PasswordInput
              label="Your password (to confirm)"
              value={roleChange.currentPassword}
              onChange={(e) => {
                setRoleChange((r) => ({
                  ...r,
                  currentPassword: e.target.value,
                }))
                setErrors({})
              }}
              error={errors.roleChangePassword}
              autoComplete="current-password"
            />
          </div>
        )}
      </ConfirmDialog>
    </>
  )
}
