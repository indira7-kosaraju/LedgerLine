import { useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useApi } from '../../hooks/useApi'
import { useToast } from '../../hooks/useToast'
import { createAccount, listAccounts } from '../../api/accounts.api'
import { listTransactions } from '../../api/transactions.api'
import PageHeader from '../../components/ui/PageHeader'
import StatCard from '../../components/ui/StatCard'
import Button from '../../components/ui/Button'
import ErrorState from '../../components/ui/ErrorState'
import { Card, CardHeader } from '../../components/ui/Card'
import AccountCard from '../../components/domain/AccountCard'
import TransactionsTable from '../../components/domain/TransactionsTable'
import { PlusIcon, WalletIcon } from '../../components/icons'

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

export default function HolderDashboard() {
  const { user } = useAuth()
  const toast = useToast()
  const [opening, setOpening] = useState(false)

  const accounts = useApi((opts) => listAccounts({ limit: 100 }, opts))
  const recent = useApi((opts) => listTransactions({ limit: 5 }, opts))

  const items = useMemo(() => accounts.data?.items ?? [], [accounts.data])
  const ownIds = useMemo(() => new Set(items.map((a) => a.id)), [items])
  const activeCount = items.filter((a) => a.status === 'ACTIVE').length

  async function handleOpenAccount() {
    setOpening(true)
    try {
      const account = await createAccount()
      toast.success(`Account ${account.accountNumber} opened.`)
      accounts.reload()
    } catch (error) {
      toast.error(error.message) // e.g. "You can have at most 5 accounts"
    } finally {
      setOpening(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={greeting()}
        title={user.fullName}
        description="Here is an overview of your LedgerLine accounts."
        actions={
          <Button onClick={handleOpenAccount} loading={opening}>
            <PlusIcon className="size-4" /> Open new account
          </Button>
        }
      />

      <ErrorState error={accounts.error} onRetry={accounts.reload} className="mb-6" />

      <div className="grid gap-4 sm:grid-cols-3">
        {/* Total comes from the backend (PostgreSQL SUM) – not added up in the browser. */}
        <StatCard label="Total balance" value={accounts.data?.summary.totalBalance.formatted} hint="Across all your accounts" />
        <StatCard label="Accounts" value={accounts.data ? items.length : undefined} hint={accounts.data ? `${activeCount} active` : undefined} />
        <StatCard label="Transactions" value={recent.data?.total} hint="All time" />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Your accounts</h2>
        {accounts.data && items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
            <WalletIcon className="mx-auto size-8 text-slate-400" />
            <p className="mt-3 font-medium text-slate-900">You don&apos;t have an account yet</p>
            <p className="mt-1 text-sm text-slate-500">Open your first account to start depositing simulated money.</p>
            <Button className="mt-4" onClick={handleOpenAccount} loading={opening}>
              Open my first account
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((account) => (
              <AccountCard key={account.id} account={account} />
            ))}
            {!accounts.data && !accounts.error && [0, 1].map((i) => <div key={i} className="h-36 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        )}
      </section>

      <Card className="mt-8">
        <CardHeader title="Recent transactions" description="Your latest money movements" />
        <ErrorState error={recent.error} onRetry={recent.reload} className="m-4" />
        <TransactionsTable items={recent.data?.items} loading={recent.loading} ownAccountIds={ownIds} compact />
      </Card>
    </>
  )
}
