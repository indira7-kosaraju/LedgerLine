import { Link } from 'react-router'
import { Card, CardBody } from '../ui/Card'
import Button from '../ui/Button'
import { buttonClasses } from '../ui/buttonStyles'
import { CheckCircleIcon } from '../icons'
import { formatDateTime, humanize } from '../../utils/format'

// Shown after a successful deposit / withdrawal / transfer.
// Every value comes from the backend's response – nothing is computed here.
export default function TransactionReceipt({ result, onNew }) {
  const { transaction: t, account } = result
  return (
    <Card className="border-emerald-200">
      <CardBody className="space-y-5">
        <div className="flex items-start gap-3">
          <CheckCircleIcon className="size-7 shrink-0 text-emerald-600" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{humanize(t.type)} complete</h2>
            <p className="text-sm text-slate-500">Recorded in the ledger · {formatDateTime(t.createdAt)}</p>
          </div>
        </div>

        <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{t.amount.formatted}</p>

        <dl className="grid gap-4 rounded-lg bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Reference</dt>
            <dd className="mt-0.5 font-mono text-slate-900">{t.reference}</dd>
          </div>
          <div>
            <dt className="text-slate-500">From → To</dt>
            <dd className="mt-0.5 font-mono text-xs text-slate-900">
              {t.fromAccount.accountNumber} → {t.toAccount.accountNumber}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">New balance of {account.accountNumber}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{account.balance.formatted}</dd>
          </div>
          {t.description && (
            <div>
              <dt className="text-slate-500">Description</dt>
              <dd className="mt-0.5 text-slate-900">{t.description}</dd>
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
