import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useApi } from '../hooks/useApi'
import { useQueryParams } from '../hooks/useQueryParams'
import { listAccounts } from '../api/accounts.api'
import { listTransactions } from '../api/transactions.api'
import { can } from '../config/roles'
import PageHeader from '../components/ui/PageHeader'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Button from '../components/ui/Button'
import Pagination from '../components/ui/Pagination'
import ErrorState from '../components/ui/ErrorState'
import { Card } from '../components/ui/Card'
import { buttonClasses } from '../components/ui/buttonStyles'
import TransactionsTable from '../components/domain/TransactionsTable'

const LIMIT = 20

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'DEPOSIT', label: 'Deposits' },
  { value: 'WITHDRAWAL', label: 'Withdrawals' },
  { value: 'TRANSFER', label: 'Transfers' },
]

// Account holders: their own transactions. Admin / auditor: every transaction.
// The backend applies that rule – this page just shows what it returns.
export default function TransactionsPage() {
  const { user } = useAuth()
  const isHolder = !can(user.role, 'transactions:read:any')
  const { get, page, update } = useQueryParams()
  const type = get('type')
  const accountId = get('account')
  const q = get('q')
  const [search, setSearch] = useState(q)

  const transactions = useApi((opts) => listTransactions({ page, limit: LIMIT, type, accountId, q }, opts), [page, type, accountId, q])
  // Holders: their accounts power the account filter and the +/− direction.
  const accounts = useApi((opts) => (isHolder ? listAccounts({ limit: 100 }, opts) : Promise.resolve(null)), [isHolder])
  const ownIds = useMemo(() => (accounts.data ? new Set(accounts.data.items.map((a) => a.id)) : undefined), [accounts.data])

  const accountOptions = [{ value: '', label: 'All my accounts' }, ...(accounts.data?.items ?? []).map((a) => ({ value: a.id, label: a.accountNumber }))]
  const filtered = Boolean(q || type || accountId)

  return (
    <>
      <PageHeader
        title="Transactions"
        description={isHolder ? 'Every deposit, withdrawal and transfer on your accounts.' : 'Every money movement in LedgerLine.'}
        actions={
          isHolder && (
            <>
              <Link to="/deposit" className={buttonClasses('secondary')}>
                Deposit
              </Link>
              <Link to="/withdraw" className={buttonClasses('secondary')}>
                Withdraw
              </Link>
              <Link to="/transfer" className={buttonClasses('primary')}>
                Transfer
              </Link>
            </>
          )
        }
      />

      <Card>
        <form
          className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            update({ q: search.trim() })
          }}
        >
          <Input
            label="Reference"
            placeholder="e.g. TXN-20261107-9F3A"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
            maxLength={40}
            inputClassName="font-mono"
          />
          <Select label="Type" options={TYPE_OPTIONS} value={type} onChange={(e) => update({ type: e.target.value })} className="md:w-44" />
          {isHolder && (
            <Select label="Account" options={accountOptions} value={accountId} onChange={(e) => update({ account: e.target.value })} className="md:w-52" />
          )}
          <div className="flex gap-2">
            <Button type="submit">Search</Button>
            {filtered && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch('')
                  update({ q: '', type: '', account: '' })
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </form>

        <ErrorState error={transactions.error} onRetry={transactions.reload} className="m-4" />
        <TransactionsTable
          items={transactions.data?.items}
          loading={transactions.loading}
          ownAccountIds={ownIds}
          empty={filtered ? 'No transactions match these filters.' : 'No transactions yet.'}
        />
        <Pagination page={page} limit={LIMIT} total={transactions.data?.total} onPageChange={(p) => update({ page: p })} disabled={transactions.loading} />
      </Card>
    </>
  )
}
