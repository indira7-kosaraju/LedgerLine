import { useApi } from '../hooks/useApi'
import { useQueryParams } from '../hooks/useQueryParams'
import { listAuditLogs } from '../api/oversight.api'
import PageHeader from '../components/ui/PageHeader'
import Select from '../components/ui/Select'
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
  { value: 'CSRF_', label: 'CSRF protection' },
]

// ADMIN and AUDITOR. Read-only – the audit log can't be edited (enforced by a database trigger).
export default function AuditLogsPage() {
  const { get, page, update } = useQueryParams()
  const outcome = get('outcome')
  const category = get('category')

  const logs = useApi((opts) => listAuditLogs({ page, limit: LIMIT, outcome, actionPrefix: category }, opts), [page, outcome, category])

  return (
    <>
      <PageHeader title="Audit logs" description="Every sign-in, permission check and money movement – including refused attempts." />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <Select label="Outcome" options={OUTCOME_OPTIONS} value={outcome} onChange={(e) => update({ outcome: e.target.value })} className="sm:w-48" />
          <Select label="Category" options={CATEGORY_OPTIONS} value={category} onChange={(e) => update({ category: e.target.value })} className="sm:w-56" />
        </div>
        <ErrorState error={logs.error} onRetry={logs.reload} className="m-4" />
        <AuditLogTable items={logs.data?.items} loading={logs.loading} empty="No audit events match these filters." />
        <Pagination page={page} limit={LIMIT} total={logs.data?.total} onPageChange={(p) => update({ page: p })} disabled={logs.loading} />
      </Card>
    </>
  )
}
