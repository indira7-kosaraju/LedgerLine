import { useApi } from '../hooks/useApi'
import { useQueryParams } from '../hooks/useQueryParams'
import { listLedgerEntries, verifyLedger } from '../api/oversight.api'
import PageHeader from '../components/ui/PageHeader'
import Pagination from '../components/ui/Pagination'
import ErrorState from '../components/ui/ErrorState'
import { Card, CardHeader } from '../components/ui/Card'
import LedgerEntriesTable from '../components/domain/LedgerEntriesTable'
import LedgerIntegrityCard from '../components/domain/LedgerIntegrityCard'

const LIMIT = 25

// ADMIN and AUDITOR. The ledger is append-only – there is nothing to edit here.
export default function LedgerPage() {
  const { page, update } = useQueryParams()
  const entries = useApi((opts) => listLedgerEntries({ page, limit: LIMIT }, opts), [page])
  const integrity = useApi((opts) => verifyLedger(opts))

  return (
    <>
      <PageHeader title="Ledger" description="The double-entry record behind every balance. Entries are never changed or deleted." />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Card className="min-w-0">
          <CardHeader title="Ledger entries" description="Newest first" />
          <ErrorState error={entries.error} onRetry={entries.reload} className="m-4" />
          <LedgerEntriesTable items={entries.data?.items} loading={entries.loading} />
          <Pagination page={page} limit={LIMIT} total={entries.data?.total} onPageChange={(p) => update({ page: p })} disabled={entries.loading} />
        </Card>
        <div>
          <LedgerIntegrityCard result={integrity} />
        </div>
      </div>
    </>
  )
}
