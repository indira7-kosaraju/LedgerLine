import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useApi } from '../hooks/useApi'
import { useToast } from '../hooks/useToast'
import { listAccounts } from '../api/accounts.api'
import { deposit, transfer, withdraw } from '../api/transactions.api'
import { parseAmount } from '../utils/money'
import { describeMoneyError, moneyFieldErrors } from '../utils/moneyErrors'
import { cn } from '../utils/cn'
import PageHeader from '../components/ui/PageHeader'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import ErrorState from '../components/ui/ErrorState'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import FullPageSpinner from '../components/ui/FullPageSpinner'
import { Card, CardBody } from '../components/ui/Card'
import { buttonClasses } from '../components/ui/buttonStyles'
import TransactionReceipt from '../components/domain/TransactionReceipt'

const CONFIG = {
  DEPOSIT: {
    title: 'Deposit money',
    description: 'Add simulated money to one of your accounts.',
    accountLabel: 'Deposit into',
    verb: 'Deposit', // button text: "Deposit ₹500.00"
    noun: 'deposit', // sentence text: "Review deposit"
  },
  WITHDRAWAL: {
    title: 'Withdraw money',
    description: 'Take simulated money out of one of your accounts.',
    accountLabel: 'Withdraw from',
    verb: 'Withdraw',
    noun: 'withdrawal',
  },
  TRANSFER: {
    title: 'Transfer money',
    description: 'Send money to another of your accounts, or to any LedgerLine account number.',
    accountLabel: 'From account',
    verb: 'Transfer',
    noun: 'transfer',
  },
}

const EMPTY_FORM = { accountId: '', amount: '', description: '', destinationMode: 'own', toAccountId: '', toAccountNumber: '' }
const ACCOUNT_NUMBER_PATTERN = /^LL\d{10}$/

function SummaryRow({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{children}</dd>
    </div>
  )
}

// One page for all three operations: <MoneyMovementPage type="DEPOSIT" />.
// Flow: fill in → client checks the FORMAT → confirmation dialog → backend validates
// and executes inside a database transaction → receipt. React never decides whether
// the money may move (balance, limits, ownership, account status are all server-side).
export default function MoneyMovementPage({ type }) {
  const config = CONFIG[type]
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const accounts = useApi((opts) => listAccounts({ limit: 100 }, opts))

  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [review, setReview] = useState(null) // the checked request, waiting for confirmation
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  // Only ACTIVE accounts can move money (the backend enforces this too).
  const active = useMemo(() => (accounts.data?.items ?? []).filter((a) => a.status === 'ACTIVE'), [accounts.data])

  // Defaults are derived during render (no effects): ?account=<id> from an account page, else the first account.
  const preselected = searchParams.get('account')
  const accountId = form.accountId || (active.some((a) => a.id === preselected) ? preselected : active[0]?.id) || ''
  const source = active.find((a) => a.id === accountId)
  const ownDestinations = active.filter((a) => a.id !== accountId)
  const toAccountId = form.toAccountId && form.toAccountId !== accountId ? form.toAccountId : ownDestinations[0]?.id || ''
  const destinationMode = ownDestinations.length === 0 ? 'number' : form.destinationMode
  const preview = parseAmount(form.amount)

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }))
    setErrors((e) => ({ ...e, [name]: undefined, ...(name.startsWith('to') || name === 'destinationMode' ? { destination: undefined } : {}) }))
    setFormError(null)
  }
  const onChange = (event) => setField(event.target.name, event.target.value)

  // Checks the FORMAT of what was typed and builds the request. No balance checks here.
  function handleReview(event) {
    event.preventDefault()
    const found = {}
    if (!source) found.accountId = 'Choose an account'
    const amount = parseAmount(form.amount)
    if (amount.error) found.amount = amount.error
    const description = form.description.trim()
    if (description.length > 140) found.description = 'Description can be at most 140 characters'

    let destination = null
    if (type === 'TRANSFER') {
      if (destinationMode === 'own') {
        const target = ownDestinations.find((a) => a.id === toAccountId)
        if (!target) found.destination = 'Choose the account to send money to'
        else destination = { body: { toAccountId: target.id }, label: target.accountNumber }
      } else {
        const number = form.toAccountNumber.trim().toUpperCase()
        if (!ACCOUNT_NUMBER_PATTERN.test(number)) found.destination = 'Account numbers look like LL1234567890'
        else if (number === source?.accountNumber) found.destination = 'You cannot transfer to the same account'
        else destination = { body: { toAccountNumber: number }, label: number }
      }
    }

    setErrors(found)
    setFormError(null)
    if (Object.keys(found).length) return

    setReview({
      amountPaise: amount.paise,
      amountDisplay: amount.display,
      description: description || undefined,
      from: type === 'DEPOSIT' ? 'External source (simulated)' : source.accountNumber,
      to: type === 'DEPOSIT' ? source.accountNumber : type === 'WITHDRAWAL' ? 'External (simulated)' : destination.label,
      destinationBody: destination?.body,
    })
  }

  async function handleConfirm() {
    setSubmitting(true)
    const { amountPaise, description, destinationBody } = review
    try {
      let response
      if (type === 'DEPOSIT') response = await deposit({ accountId, amountPaise, description })
      else if (type === 'WITHDRAWAL') response = await withdraw({ accountId, amountPaise, description })
      else response = await transfer({ fromAccountId: accountId, ...destinationBody, amountPaise, description })

      setResult(response)
      setReview(null)
      setForm((f) => ({ ...EMPTY_FORM, accountId: f.accountId }))
      toast.success(`${config.noun.charAt(0).toUpperCase() + config.noun.slice(1)} of ${response.transaction.amount.formatted} completed.`)
    } catch (error) {
      setReview(null)
      setFormError(error)
      setErrors(moneyFieldErrors(error))
    } finally {
      setSubmitting(false)
      accounts.reload() // refresh balances after success – and after an uncertain failure
    }
  }

  const header = <PageHeader title={config.title} description={config.description} />

  if (result) {
    return (
      <>
        {header}
        <div className="max-w-2xl">
          <TransactionReceipt result={result} onNew={() => setResult(null)} />
        </div>
      </>
    )
  }

  if (accounts.error) return (<>{header}<ErrorState error={accounts.error} onRetry={accounts.reload} /></>)
  if (!accounts.data) return <FullPageSpinner label="Loading your accounts…" />

  if (active.length === 0) {
    return (
      <>
        {header}
        <Alert tone="warning" title="You need an active account">
          <p>Open an account first (frozen and closed accounts cannot move money).</p>
          <Link to="/accounts" className={buttonClasses('secondary', 'sm', 'mt-3')}>
            Go to accounts
          </Link>
        </Alert>
      </>
    )
  }

  const problem = formError && describeMoneyError(formError)
  const accountOptions = active.map((a) => ({ value: a.id, label: `${a.accountNumber} · ${a.balance.formatted}` }))

  return (
    <>
      {header}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,40rem)_1fr]">
        <Card>
          <CardBody>
            {problem && (
              <Alert tone={problem.uncertain ? 'warning' : 'danger'} title={problem.title} className="mb-5">
                <p>{problem.message}</p>
                {problem.uncertain && (
                  <Link to="/transactions" className="mt-2 inline-block font-medium underline">
                    Open transaction history
                  </Link>
                )}
              </Alert>
            )}

            <form onSubmit={handleReview} noValidate className="space-y-5">
              <Select
                label={config.accountLabel}
                name="accountId"
                value={accountId}
                onChange={onChange}
                options={accountOptions}
                error={errors.accountId}
                hint={source && type !== 'DEPOSIT' ? `Available balance: ${source.balance.formatted}` : undefined}
              />

              {type === 'TRANSFER' && (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium text-slate-700">Send to</legend>
                  <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Destination type">
                    {[
                      ['own', 'My other account'],
                      ['number', 'Account number'],
                    ].map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={destinationMode === mode}
                        disabled={mode === 'own' && ownDestinations.length === 0}
                        onClick={() => setField('destinationMode', mode)}
                        className={cn(
                          'rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                          destinationMode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {destinationMode === 'own' ? (
                    <Select
                      label="To account"
                      srOnlyLabel
                      name="toAccountId"
                      value={toAccountId}
                      onChange={onChange}
                      options={ownDestinations.map((a) => ({ value: a.id, label: `${a.accountNumber} · ${a.balance.formatted}` }))}
                      error={errors.destination}
                    />
                  ) : (
                    <Input
                      label="Recipient account number"
                      name="toAccountNumber"
                      value={form.toAccountNumber}
                      onChange={onChange}
                      placeholder="LL1234567890"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={12}
                      inputClassName="font-mono uppercase"
                      error={errors.destination}
                      hint="Ask the recipient for their LedgerLine account number."
                    />
                  )}
                </fieldset>
              )}

              <Input
                label="Amount"
                name="amount"
                leading="₹"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={form.amount}
                onChange={onChange}
                error={errors.amount}
                hint={!errors.amount && form.amount && !preview.error ? `${config.verb} ${preview.display}` : 'Up to 2 decimal places, e.g. 1250.50'}
                inputClassName="tabular-nums"
              />

              <Input
                label="Description (optional)"
                name="description"
                value={form.description}
                onChange={onChange}
                maxLength={140}
                placeholder={type === 'TRANSFER' ? 'e.g. Rent for November' : 'e.g. Savings'}
                error={errors.description}
              />

              <Button type="submit" className="w-full sm:w-auto">
                Review {config.noun}
              </Button>
            </form>
          </CardBody>
        </Card>

        <aside className="space-y-3 text-sm text-slate-600">
          <h2 className="font-semibold text-slate-900">What happens next</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>You confirm the details.</li>
            <li>The server checks your account, its status, your balance and the limits.</li>
            <li>If everything is valid, both balances and two ledger entries are written in one database transaction – all or nothing.</li>
            <li>Refused attempts are recorded in the audit log.</li>
          </ol>
        </aside>
      </div>

      <ConfirmDialog
        open={Boolean(review)}
        title={`Confirm ${config.noun}`}
        confirmLabel={review ? `${config.verb} ${review.amountDisplay}` : config.verb}
        loading={submitting}
        onConfirm={handleConfirm}
        onCancel={() => setReview(null)}
      >
        {review && (
          <>
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{review.amountDisplay}</p>
            <dl className="mt-4 divide-y divide-slate-100 border-y border-slate-100 text-sm">
              <SummaryRow label="From">
                <span className="font-mono">{review.from}</span>
              </SummaryRow>
              <SummaryRow label="To">
                <span className="font-mono">{review.to}</span>
              </SummaryRow>
              {review.description && <SummaryRow label="Description">{review.description}</SummaryRow>}
            </dl>
            <p className="mt-3 text-xs text-slate-500">Simulated money. The server makes the final decision.</p>
          </>
        )}
      </ConfirmDialog>
    </>
  )
}
