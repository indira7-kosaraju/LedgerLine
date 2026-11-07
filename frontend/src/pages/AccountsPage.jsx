import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useApi } from '../hooks/useApi'
import { useToast } from '../hooks/useToast'
import { useQueryParams } from '../hooks/useQueryParams'
import { createAccount, listAccounts } from '../api/accounts.api'
import { can } from '../config/roles'
import { formatDate, humanize } from '../utils/format'
import PageHeader from '../components/ui/PageHeader'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import DataTable from '../components/ui/DataTable'
import Pagination from '../components/ui/Pagination'
import ErrorState from '../components/ui/ErrorState'
import { Card } from '../components/ui/Card'
import AccountCard from '../components/domain/AccountCard'
import { AccountLink } from '../components/domain/TransactionsTable'
import { AccountStatusBadge } from '../components/domain/StatusBadges'
import { PlusIcon } from '../components/icons'

const LIMIT = 20

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'FROZEN', label: 'Frozen' },
  { value: 'CLOSED', label: 'Closed' },
]
const TYPE_OPTIONS = [
  { value: 'CUSTOMER', label: 'Customer accounts' },
  { value: 'SYSTEM', label: 'System account' },
  { value: 'ALL', label: 'All types' },
]

// ADMIN / AUDITOR: searchable table of every account.
function AllAccounts() {
  const { get, page, update } = useQueryParams({ type: 'CUSTOMER' })
  const status = get('status')
  const type = get('type')
  const q = get('q')
  const [search, setSearch] = useState(q)

  const accounts = useApi(
    (opts) => listAccounts({ page, limit: LIMIT, status, type: type === 'ALL' ? undefined : type, q }, opts),
    [page, status, type, q],
  )

  const columns = [
    { key: 'accountNumber', header: 'Account', render: (a) => <AccountLink account={a} /> },
    {
      key: 'owner',
      header: 'Owner',
      render: (a) =>
        a.owner ? (
          <div>
            <p className="text-slate-900">{a.owner.fullName}</p>
            <p className="text-xs text-slate-500">{a.owner.email}</p>
          </div>
        ) : (
          <span className="text-slate-500">LedgerLine system</span>
        ),
    },
    { key: 'type', header: 'Type', render: (a) => humanize(a.type) },
    { key: 'status', header: 'Status', render: (a) => <AccountStatusBadge status={a.status} /> },
    { key: 'balance', header: 'Balance', align: 'right', render: (a) => <span className="font-medium tabular-nums text-slate-900">{a.balance.formatted}</span> },
    { key: 'createdAt', header: 'Opened', render: (a) => <span className="text-slate-500">{formatDate(a.createdAt)}</span> },
  ]

  return (
    <>
      <PageHeader title="Accounts" description="Every account in LedgerLine. Open one to see its statement." />

      <Card>
        <form
          className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            update({ q: search.trim() })
          }}
        >
          <Input
            label="Search"
            placeholder="Account number, owner name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
            maxLength={64}
          />
          <Select label="Status" options={STATUS_OPTIONS} value={status} onChange={(e) => update({ status: e.target.value })} className="md:w-44" />
          <Select label="Type" options={TYPE_OPTIONS} value={type} onChange={(e) => update({ type: e.target.value })} className="md:w-48" />
          <div className="flex gap-2">
            <Button type="submit">Search</Button>
            {(q || status || type !== 'CUSTOMER') && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch('')
                  update({ q: '', status: '', type: '' })
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </form>

        {accounts.data && (
          <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
            {accounts.data.total} account{accounts.data.total === 1 ? '' : 's'} · customer balances in this view total{' '}
            <span className="font-medium tabular-nums text-slate-700">{accounts.data.summary.totalBalance.formatted}</span>
          </p>
        )}

        <ErrorState error={accounts.error} onRetry={accounts.reload} className="m-4" />
        <DataTable columns={columns} rows={accounts.data?.items} loading={accounts.loading} empty="No accounts match these filters." caption="Accounts" />
        <Pagination page={page} limit={LIMIT} total={accounts.data?.total} onPageChange={(p) => update({ page: p })} disabled={accounts.loading} />
      </Card>
    </>
  )
}

// ACCOUNT_HOLDER: their own accounts as cards.
function MyAccounts() {
  const toast = useToast()
  const [opening, setOpening] = useState(false)
  const accounts = useApi((opts) => listAccounts({ limit: 100 }, opts))

  async function handleOpenAccount() {
    setOpening(true)
    try {
      const account = await createAccount()
      toast.success(`Account ${account.accountNumber} opened.`)
      accounts.reload()
    } catch (error) {
      toast.error(error.message)
    } finally {
      setOpening(false)
    }
  }

  return (
    <>
      <PageHeader
        title="My accounts"
        description={accounts.data ? `Total balance ${accounts.data.summary.totalBalance.formatted}` : 'Your LedgerLine accounts'}
        actions={
          <Button onClick={handleOpenAccount} loading={opening}>
            <PlusIcon className="size-4" /> Open new account
          </Button>
        }
      />
      <ErrorState error={accounts.error} onRetry={accounts.reload} className="mb-6" />
      {accounts.data?.items.length === 0 && <p className="text-sm text-slate-500">You don&apos;t have any accounts yet.</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {accounts.data?.items.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
      </div>
    </>
  )
}

export default function AccountsPage() {
  const { user } = useAuth()
  return can(user.role, 'accounts:read:any') ? <AllAccounts /> : <MyAccounts />
}
