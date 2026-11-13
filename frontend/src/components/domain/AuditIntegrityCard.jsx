import { Card, CardBody, CardHeader } from '../ui/Card'
import Button from '../ui/Button'
import ErrorState from '../ui/ErrorState'
import { AlertTriangleIcon, FileIcon, LinkIcon, ShieldCheckIcon } from '../icons'
import { formatDateTime } from '../../utils/format'
import { cn } from '../../utils/cn'

// Shows the result of GET /api/audit-logs/verify (step 6): the database recomputes the hash chain over every
// audit record. A changed, removed or reordered record breaks it. This card only displays the server's verdict –
// "Audit trail intact" appears only when the server says ok.
//   variant="hero": the large verification panel at the top of the auditor dashboard.
export default function AuditIntegrityCard({ result, variant = 'card' }) {
  const { data, error, loading, reload } = result
  const hero = variant === 'hero'

  const verdict = data && (
    <div
      className={cn(
        'flex items-center gap-4 rounded-xl border px-4 py-4',
        data.ok ? 'border-success/25 bg-success/5' : 'border-danger/40 bg-danger/10',
        hero && 'sm:px-6 sm:py-5',
      )}
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-2xl border',
          data.ok ? 'border-gold-line/70 bg-gold-dark/60 text-gold-soft' : 'border-danger/50 bg-danger/10 text-danger',
          hero ? 'size-16' : 'size-12',
        )}
        aria-hidden="true"
      >
        {data.ok ? <ShieldCheckIcon className={hero ? 'size-9' : 'size-7'} /> : <AlertTriangleIcon className={hero ? 'size-9' : 'size-7'} />}
      </span>
      <div className="min-w-0">
        {hero && <p className="text-sm font-medium text-ink-2">Audit verification</p>}
        <p className={cn('font-semibold', data.ok ? 'text-success' : 'text-danger', hero ? 'text-2xl sm:text-3xl' : 'text-lg')}>
          {data.ok ? 'Audit trail intact' : 'Audit trail tampered with'}
        </p>
        <p className="mt-0.5 text-xs text-ink-3">
          {data.records} records · checked {formatDateTime(data.checkedAt)}
        </p>
      </div>
    </div>
  )

  return (
    <Card className={cn(hero && 'surface-gradient border-gold-deep/60')}>
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
        {!data && !error && <div className={cn('animate-pulse rounded-xl bg-elevated', hero ? 'h-28' : 'h-20')} aria-label="Loading" />}
        {data && (
          <>
            {verdict}
            {!data.ok && (
              <ul className="space-y-1 text-sm text-danger">
                {data.problems.map((p) => (
                  <li key={p.chainSeq}>
                    Record #{p.chainSeq}: {p.problem}
                  </li>
                ))}
              </ul>
            )}
            {hero && (
              <dl className="grid gap-3 sm:grid-cols-3">
                <HeroStat icon={LinkIcon} label="Chain head" value={data.head ? `#${data.head.chainSeq}` : '—'} />
                <HeroStat icon={FileIcon} label="Records checked" value={data.records} />
                <HeroStat
                  icon={ShieldCheckIcon}
                  label="Verification"
                  value={data.ok ? '✓ Passed' : '✗ Failed'}
                  className={data.ok ? 'text-success' : 'text-danger'}
                />
              </dl>
            )}
            {data.head && (
              <p className="break-all text-xs text-ink-3">
                Latest record #{data.head.chainSeq} · hash <span className="font-mono text-gold-soft">{data.head.hash.slice(0, 16)}…</span>
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}

function HeroStat({ icon: Icon, label, value, className }) {
  return (
    <div className="rounded-xl border border-line bg-card/80 px-4 py-3">
      <dt className="flex items-center gap-2 text-xs font-medium text-ink-2">
        <Icon className="size-4 text-gold-soft" />
        {label}
      </dt>
      <dd className={cn('mt-1 text-2xl font-semibold tabular-nums text-ink', className)}>{value}</dd>
    </div>
  )
}
