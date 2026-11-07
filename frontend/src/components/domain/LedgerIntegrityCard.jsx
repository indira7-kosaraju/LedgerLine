import { Card, CardBody, CardHeader } from '../ui/Card'
import Button from '../ui/Button'
import ErrorState from '../ui/ErrorState'
import { AlertCircleIcon, CheckCircleIcon } from '../icons'
import { formatDateTime } from '../../utils/format'
import { cn } from '../../utils/cn'

const CHECK_LABELS = {
  balancesMatchLedger: 'Every balance equals its ledger entries',
  everyTransactionBalanced: 'Every transaction has a matching debit and credit',
  runningBalancesConsistent: 'Running balances are consistent',
  moneyConserved: 'Money is conserved (all balances sum to ₹0)',
}

// Shows the result of GET /api/ledger/verify – the backend recomputes
// everything from the ledger; this card only displays its verdict.
export default function LedgerIntegrityCard({ result }) {
  const { data, error, loading, reload } = result

  return (
    <Card>
      <CardHeader
        title="Ledger integrity"
        description="Recomputed from every ledger entry by the server"
        action={
          <Button variant="secondary" size="sm" onClick={reload} loading={loading}>
            Re-verify
          </Button>
        }
      />
      <CardBody className="space-y-4">
        <ErrorState error={error} onRetry={reload} />
        {!data && !error && <div className="h-24 animate-pulse rounded-lg bg-slate-100" aria-label="Loading" />}
        {data && (
          <>
            <div className={cn('flex items-center gap-3 rounded-lg px-4 py-3', data.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800')}>
              {data.ok ? <CheckCircleIcon className="size-6" /> : <AlertCircleIcon className="size-6" />}
              <div>
                <p className="font-semibold">{data.ok ? 'Books are balanced' : 'Integrity problem detected'}</p>
                <p className="text-xs opacity-80">Checked {formatDateTime(data.checkedAt)}</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm">
              {Object.entries(CHECK_LABELS).map(([key, label]) => {
                const ok = data.checks[key]
                return (
                  <li key={key} className="flex items-start gap-2">
                    <span className={cn('mt-0.5', ok ? 'text-emerald-600' : 'text-rose-600')} aria-hidden="true">
                      {ok ? '✓' : '✗'}
                    </span>
                    <span className="text-slate-700">{label}</span>
                    <span className="sr-only">{ok ? 'passed' : 'failed'}</span>
                  </li>
                )
              })}
            </ul>
            <dl className="grid grid-cols-3 gap-3 border-t border-slate-100 pt-4 text-center text-xs">
              <div>
                <dt className="text-slate-500">Accounts</dt>
                <dd className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">{data.counts.accounts}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Transactions</dt>
                <dd className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">{data.counts.transactions}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Ledger entries</dt>
                <dd className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">{data.counts.ledgerEntries}</dd>
              </div>
            </dl>
          </>
        )}
      </CardBody>
    </Card>
  )
}
