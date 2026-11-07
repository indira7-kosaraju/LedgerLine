import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useApi } from '../hooks/useApi'
import { useToast } from '../hooks/useToast'
import { useQueryParams } from '../hooks/useQueryParams'
import { getAccount, getStatement, updateAccountStatus } from '../api/accounts.api'
import { can } from '../config/roles'
import { formatDateTime, humanize } from '../utils/format'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Badge from '../components/ui/Badge'
import Pagination from '../components/ui/Pagination'
import ErrorState from '../components/ui/ErrorState'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import FullPageSpinner from '../components/ui/FullPageSpinner'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { AccountStatusBadge } from '../components/domain/StatusBadges'
import LedgerEntriesTable from '../components/domain/LedgerEntriesTable'

const LIMIT = 20

const STATUS_ACTIONS = {
  FROZEN: {
    label: 'Freeze account',
    tone: 'danger',
    text: 'The holder will not be able to deposit, withdraw or transfer, and incoming transfers will be refused. The balance is kept.',
  },
  ACTIVE: { label: 'Unfreeze account', tone: 'primary', text: 'The account will be able to move money again.' },
  CLOSED: {
    label: 'Close account',
    tone: 'danger',
    text: 'Closing is permanent and only allowed when the balance is ₹0.00. A closed account can never be reopened.',
  },
}

// Which status changes make sense from the current status.
const NEXT_STATUSES = { ACTIVE: ['FROZEN', 'CLOSED'], FROZEN: ['ACTIVE', 'CLOSED'], CLOSED: [] }

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{children}</dd>
    </div>
  )
}

// ADMIN only: freeze / unfreeze / close with a confirmation step.
function StatusManager({ account, onChanged }) {
  const toast = useToast()
  const [pending, setPending] = useState(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const reasonError = reason.trim() && reason.trim().length < 3 ? 'Reason must be at least 3 characters' : undefined

  function close() {
    setPending(null)
    setReason('')
  }

  async function confirm() {
    if (reasonError) return
    setSaving(true)
    try {
      await updateAccountStatus(account.id, { status: pending, reason: reason.trim() || undefined })
      toast.success(`Account ${account.accountNumber} is now ${humanize(pending).toLowerCase()}.`)
      close()
      onChanged()
    } catch (error) {
      toast.error(error.message) // e.g. "Account balance must be zero before closing"
    } finally {
      setSaving(false)
    }
  }

  const action = pending && STATUS_ACTIONS[pending]
  return (
    <>
      {NEXT_STATUSES[account.status].map((status) => (
        <Button key={status} variant={status === 'ACTIVE' ? 'primary' : 'secondary'} onClick={() => setPending(status)}>
          {STATUS_ACTIONS[status].label}
        </Button>
      ))}
      <ConfirmDialog
        open={Boolean(pending)}
        title={action ? `${action.label}?` : ''}
        confirmLabel={action?.label}
        tone={action?.tone}
        loading={saving}
        onConfirm={confirm}
        onCancel={close}
      >
        <p>{action?.text}</p>
        <p className="mt-2">
          Account <span className="font-mono font-medium text-slate-900">{account.accountNumber}</span> · balance{' '}
          <span className="font-medium tabular-nums text-slate-900">{account.balance.formatted}</span>
        </p>
        <Input
          label="Reason (optional, saved in the audit log)"
          className="mt-4"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={reasonError}
          maxLength={200}
        />
      </ConfirmDialog>
    </>
  )
}

export default function AccountDetailsPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const { page, update } = useQueryParams()

  const account = useApi((opts) => getAccount(id, opts), [id])
  const statement = useApi((opts) => getStatement(id, { page, limit: LIMIT }, opts), [id, page])

  if (account.error) {
    return (
      <div className="max-w-xl">
        <ErrorState error={account.error} onRetry={account.reload} />
        <Link to="/accounts" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
          ← Back to accounts
        </Link>
      </div>
    )
  }
  if (!account.data) return <FullPageSpinner label="Loading account…" />

  const a = account.data
  const summary = statement.data?.summary
  const isOwner = a.ownerId === user.id
  const reloadAll = () => {
    account.reload()
    statement.reload()
  }

  return (
    <>
      <Link to="/accounts" className="text-sm font-medium text-slate-500 hover:text-slate-700">
        ← Accounts
      </Link>
      <div className="mt-2">
        <PageHeader
          title={<span className="font-mono">{a.accountNumber}</span>}
          description={isOwner ? 'Your account' : a.owner ? `Owned by ${a.owner.fullName} (${a.owner.email})` : 'LedgerLine system account'}
          actions={can(user.role, 'accounts:manage') && a.type === 'CUSTOMER' && <StatusManager account={a} onChanged={reloadAll} />}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-sm font-medium text-slate-500">Current balance</p>
            <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{a.balance.formatted}</p>
            <div className="mt-3">
              <AccountStatusBadge status={a.status} />
            </div>
          </CardBody>
        </Card>

        {/* The proof: the server recomputes the balance from the ledger and compares. */}
        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">Ledger proof</p>
              {summary &&
                (summary.balanceMatchesLedger ? <Badge tone="success" dot>Matches ledger</Badge> : <Badge tone="danger" dot>Mismatch</Badge>)}
            </div>
            {summary ? (
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Total credits</dt>
                  <dd className="tabular-nums text-emerald-700">{summary.totalCredits.formatted}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Total debits</dt>
                  <dd className="tabular-nums text-rose-700">{summary.totalDebits.formatted}</dd>
                </div>
                <div className="flex justify-between border-t border-slate-100 pt-1.5 font-medium">
                  <dt className="text-slate-700">Ledger balance</dt>
                  <dd className="tabular-nums text-slate-900">{summary.ledgerBalance.formatted}</dd>
                </div>
              </dl>
            ) : (
              <div className="mt-3 h-16 animate-pulse rounded bg-slate-100" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <dl className="grid grid-cols-2 gap-4">
              <Detail label="Type">{humanize(a.type)}</Detail>
              <Detail label="Currency">{a.currency}</Detail>
              <Detail label="Opened">{formatDateTime(a.createdAt)}</Detail>
              <Detail label="Last change">{formatDateTime(a.updatedAt)}</Detail>
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Statement" description="Every ledger entry for this account, newest first" />
        <ErrorState error={statement.error} onRetry={statement.reload} className="m-4" />
        <LedgerEntriesTable items={statement.data?.entries} loading={statement.loading} showAccount={false} empty="No transactions on this account yet." />
        <Pagination page={page} limit={LIMIT} total={statement.data?.total} onPageChange={(p) => update({ page: p })} disabled={statement.loading} />
      </Card>
    </>
  )
}
