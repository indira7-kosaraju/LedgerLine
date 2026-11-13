import { Link } from 'react-router'
import { Card, CardBody } from '../ui/Card'
import Button from '../ui/Button'
import Alert from '../ui/Alert'
import { buttonClasses } from '../ui/buttonStyles'
import { CheckCircleIcon } from '../icons'
import { formatDateTime, humanize } from '../../utils/format'

// Shown after a successful deposit / withdrawal / transfer.
// Every value comes from the backend's response – nothing is computed here.
export default function TransactionReceipt({ result, onNew }) {
  const { transaction: t, account } = result
  return (
    <Card className="border-success/30">
      <CardBody className="space-y-5">
        <div className="flex items-start gap-3">
          <CheckCircleIcon className="size-7 shrink-0 text-success" />
          <div>
            <h2 className="text-lg font-semibold text-ink">{humanize(t.type)} complete</h2>
            <p className="text-sm text-ink-3">Recorded in the ledger · {formatDateTime(t.createdAt)}</p>
          </div>
        </div>

        <p className="text-3xl font-semibold tabular-nums tracking-tight text-ink">{t.amount.formatted}</p>

        {/* The server recognised this as a repeat of an earlier request (same Idempotency-Key). */}
        {result.replayed && (
          <Alert tone="info" title="Already processed">
            This request had already gone through, so the server returned the original result. No money was moved twice.
          </Alert>
        )}

        <dl className="grid gap-4 rounded-lg bg-surface p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-3">Reference</dt>
            <dd className="mt-0.5 font-mono text-ink">{t.reference}</dd>
          </div>
          <div>
            <dt className="text-ink-3">From → To</dt>
            <dd className="mt-0.5 font-mono text-xs text-ink">
              {t.fromAccount.accountNumber} → {t.toAccount.accountNumber}
            </dd>
          </div>
          <div>
            <dt className="text-ink-3">New balance of {account.accountNumber}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-ink">{account.balance.formatted}</dd>
          </div>
          {t.description && (
            <div>
              <dt className="text-ink-3">Description</dt>
              <dd className="mt-0.5 text-ink">{t.description}</dd>
            </div>
          )}
        </dl>

        <div className="flex flex-wrap gap-2">
          <Link to={`/transactions/${t.id}`} className={buttonClasses('secondary')}>
            View details
          </Link>
          <Button onClick={onNew}>New {t.type === 'WITHDRAWAL' ? 'withdrawal' : t.type.toLowerCase()}</Button>
        </div>
      </CardBody>
    </Card>
  )
}
