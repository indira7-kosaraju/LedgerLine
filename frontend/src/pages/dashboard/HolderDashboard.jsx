import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import QuickActions from '../../components/domain/QuickActions'
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
import { CheckCircleIcon, ListIcon, PlusIcon, WalletIcon } from '../../components/icons'
import { humanize } from '../../utils/format'
import OnboardingNotice from '../../components/domain/OnboardingNotice'
import { needsOnboarding } from '../../config/roles'

// Premium gold balance card. The amount is the backend's PostgreSQL SUM – never added up in the browser.
// The eye button only hides the figure on screen (e.g. while presenting); it changes no data.
function BalanceCard({ value }) {
  const [hidden, setHidden] = useState(false)
  return (
    <div className="balance-gradient relative overflow-hidden rounded-2xl border border-gold-line/80 p-6 shadow-[0_24px_50px_-28px_rgb(212_166_58/0.55)] sm:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gold-bright/90">Total balance</p>
        <button
          type="button"
          onClick={() => setHidden((h) => !h)}
          aria-pressed={hidden}
          aria-label={hidden ? 'Show balance' : 'Hide balance'}
          className="rounded-md p-1 text-gold-soft hover:bg-black/20 hover:text-gold-bright"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
            {hidden && <path d="M4 4l16 16" />}
          </svg>
        </button>
      </div>
      {value === undefined ? (
        <div className="mt-3 h-10 w-48 animate-pulse rounded bg-black/30" aria-label="Loading" />
      ) : (
        <p className="mt-2 text-4xl font-semibold tabular-nums tracking-tight text-ink sm:text-5xl">{hidden ? '₹ ••••••' : value}</p>
      )}
      <p className="mt-2 text-xs text-gold-bright/70">Across all your accounts</p>
      {/* decorative gold sweep along the lower edge */}
      <svg viewBox="0 0 400 80" preserveAspectRatio="none" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full opacity-70" aria-hidden="true">
        <path d="M0 70 C 120 70, 220 60, 300 35 S 380 5, 400 0" fill="none" stroke="#e8bc55" strokeWidth="1.5" />
        <path d="M0 78 C 140 76, 240 66, 320 42 S 390 12, 400 8" fill="none" stroke="#9b7429" strokeWidth="1" />
      </svg>
    </div>
  )
}

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
          !needsOnboarding(user) && (
            <Button onClick={handleOpenAccount} loading={opening}>
              <PlusIcon className="size-4" /> Open new account
            </Button>
          )
        }
      />

      {needsOnboarding(user) && <OnboardingNotice className="mb-6" />}

      <ErrorState error={accounts.error} onRetry={accounts.reload} className="mb-6" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {/* Total comes from the backend (PostgreSQL SUM) – not added up in the browser. */}
        <BalanceCard value={accounts.data?.summary.totalBalance.formatted} />
        <StatCard label="Accounts" icon={WalletIcon} value={accounts.data ? items.length : undefined} hint={accounts.data ? `${activeCount} active` : undefined} />
        <StatCard label="Transactions" icon={ListIcon} value={recent.data?.total} hint="All time" />
        <StatCard
          label="Profile"
          icon={CheckCircleIcon}
          value={humanize(user.onboardingStatus)}
          tone={needsOnboarding(user) ? 'warning' : 'success'}
          hint={needsOnboarding(user) ? 'Complete onboarding to open accounts' : 'Onboarding complete'}
        />
      </div>

      {activeCount > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">Move money</h2>
          <QuickActions />
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-ink">Your accounts</h2>
        {accounts.data && items.length === 0 && needsOnboarding(user) ? (
          <p className="text-sm text-ink-3">Your accounts will appear here once your onboarding is complete.</p>
        ) : accounts.data && items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-card px-6 py-10 text-center">
            <WalletIcon className="mx-auto size-8 text-gold-soft" />
            <p className="mt-3 font-medium text-ink">You don&apos;t have an account yet</p>
            <p className="mt-1 text-sm text-ink-3">Open your first account to start depositing simulated money.</p>
            <Button className="mt-4" onClick={handleOpenAccount} loading={opening}>
              Open my first account
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((account) => (
              <AccountCard key={account.id} account={account} />
            ))}
            {!accounts.data && !accounts.error && [0, 1].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-elevated" />)}
          </div>
        )}
      </section>

      <Card className="mt-8">
        <CardHeader
          title="Recent transactions"
          description="Your latest money movements"
          action={
            <Link to="/transactions" className="text-sm font-medium text-gold-soft hover:text-gold-bright">
              View all →
            </Link>
          }
        />
        <ErrorState error={recent.error} onRetry={recent.reload} className="m-4" />
        <TransactionsTable items={recent.data?.items} loading={recent.loading} ownAccountIds={ownIds} compact />
      </Card>
    </>
  )
}
