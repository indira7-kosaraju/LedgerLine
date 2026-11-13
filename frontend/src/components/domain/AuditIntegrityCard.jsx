import { Card, CardBody, CardHeader } from '../ui/Card'
import Button from '../ui/Button'
import ErrorState from '../ui/ErrorState'
import { AlertCircleIcon, CheckCircleIcon } from '../icons'
import { formatDateTime } from '../../utils/format'
import { cn } from '../../utils/cn'

// Shows the result of GET /api/audit-logs/verify (step 6): the database recomputes the hash chain over every
// audit record. A changed, removed or reordered record breaks it. This card only displays the server's verdict.
export default function AuditIntegrityCard({ result }) {
  const { data, error, loading, reload } = result
  return (
    <Card>
      <CardHeader
        title="Audit trail integrity"
        description="Hash chain recomputed over every audit record by the server"
        action={
          <Button variant="secondary" size="sm" onClick={reload} loading={loading}>
            Re-verify
          </Button>
        }
      />
      <CardBody className="space-y-4">
        <ErrorState error={error} onRetry={reload} />
        {!data && !error && <div className="h-20 animate-pulse rounded-lg bg-slate-100" aria-label="Loading" />}
        {data && (
          <>
            <div className={cn('flex items-center gap-3 rounded-lg px-4 py-3', data.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800')}>
              {data.ok ? <CheckCircleIcon className="size-6" /> : <AlertCircleIcon className="size-6" />}
              <div>
                <p className="font-semibold">{data.ok ? 'Audit trail intact' : 'Audit trail tampered with'}</p>
                <p className="text-xs opacity-80">
                  {data.records} records · checked {formatDateTime(data.checkedAt)}
                </p>
              </div>
            </div>
            {!data.ok && (
              <ul className="space-y-1 text-sm text-rose-700">
                {data.problems.map((p) => (
                  <li key={p.chainSeq}>
                    Record #{p.chainSeq}: {p.problem}
                  </li>
                ))}
              </ul>
            )}
            {data.head && (
              <p className="break-all text-xs text-slate-500">
                Latest record #{data.head.chainSeq} · hash <span className="font-mono text-slate-700">{data.head.hash.slice(0, 16)}…</span>
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}
