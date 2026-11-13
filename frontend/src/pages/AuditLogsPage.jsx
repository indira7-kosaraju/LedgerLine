import { useApi } from '../hooks/useApi'
import { useQueryParams } from '../hooks/useQueryParams'
import { listAuditLogs, verifyAuditTrail } from '../api/oversight.api'
import PageHeader from '../components/ui/PageHeader'
import Select from '../components/ui/Select'
import Input from '../components/ui/Input'
import AuditIntegrityCard from '../components/domain/AuditIntegrityCard'
import Pagination from '../components/ui/Pagination'
import ErrorState from '../components/ui/ErrorState'
import { Card } from '../components/ui/Card'
import AuditLogTable from '../components/domain/AuditLogTable'

const LIMIT = 25

const OUTCOME_OPTIONS = [
  { value: '', label: 'All outcomes' },
  { value: 'SUCCESS', label: 'Success' },
  { value: 'REFUSED', label: 'Refused' },
  { value: 'ERROR', label: 'Error' },
]

// Sent to the backend as ?actionPrefix=…
const CATEGORY_OPTIONS = [
  { value: '', label: 'All categories' },
  { value: 'TXN_', label: 'Transactions' },
  { value: 'ACCOUNT_', label: 'Accounts' },
  { value: 'AUTH_', label: 'Sign-in & registration' },
  { value: 'AUTHZ_', label: 'Permission checks' },
  { value: 'USER_', label: 'User administration' },
  { value: 'STAFF_', label: 'Staff management' },
  { value: 'ONBOARDING_', label: 'Onboarding' },
  { value: 'AUTH_SESSION', label: 'Rejected sessions' },
  { value: 'AUTH_RATE', label: 'Rate limits' },
  { value: 'CSRF_', label: 'CSRF protection' },
]

const ENTITY_OPTIONS = [
  { value: '', label: 'All entities' },
  { value: 'User', label: 'Users' },
  { value: 'Account', label: 'Accounts' },
  { value: 'Transaction', label: 'Transactions' },
]

// "2026-11-12" (a date input) → the start of that day; "to" is exclusive, so it becomes the next day.
const dayStart = (d) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined)
const nextDay = (d) => (d ? new Date(new Date(`${d}T00:00:00`).getTime() + 86_400_000).toISOString() : undefined)

// ADMIN and AUDITOR. Read-only – the audit log can't be edited (enforced by a database trigger).
export default function AuditLogsPage() {
  const { get, page, update } = useQueryParams()
  const outcome = get('outcome')
  const category = get('category')
  const entityType = get('entity')
  const from = get('from')
  const to = get('to')

  const logs = useApi(
    (opts) => listAuditLogs({ page, limit: LIMIT, outcome, actionPrefix: category, entityType, from: dayStart(from), to: nextDay(to) }, opts),
    [page, outcome, category, entityType, from, to],
  )
  const integrity = useApi((opts) => verifyAuditTrail(opts))

  return (
    <>
      <PageHeader title="Audit log" description="Every sign-in, permission check, administrative action and money movement – including refused attempts." />
      <div className="mb-6">
        <AuditIntegrityCard result={integrity} />
      </div>
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:flex-wrap">
          <Select label="Outcome" options={OUTCOME_OPTIONS} value={outcome} onChange={(e) => update({ outcome: e.target.value })} className="sm:w-44" />
          <Select label="Category" options={CATEGORY_OPTIONS} value={category} onChange={(e) => update({ category: e.target.value })} className="sm:w-52" />
          <Select label="Entity" options={ENTITY_OPTIONS} value={entityType} onChange={(e) => update({ entity: e.target.value })} className="sm:w-44" />
          <Input label="From" type="date" value={from} onChange={(e) => update({ from: e.target.value })} className="sm:w-44" />
          <Input label="To" type="date" value={to} onChange={(e) => update({ to: e.target.value })} className="sm:w-44" />
        </div>
        <ErrorState error={logs.error} onRetry={logs.reload} className="m-4" />
        <AuditLogTable items={logs.data?.items} loading={logs.loading} empty="No audit events match these filters." />
        <Pagination page={page} limit={LIMIT} total={logs.data?.total} onPageChange={(p) => update({ page: p })} disabled={logs.loading} />
      </Card>
    </>
  )
}
