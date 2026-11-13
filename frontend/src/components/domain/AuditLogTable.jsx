import DataTable from '../ui/DataTable'
import { OutcomeBadge } from './StatusBadges'
import { actionLabel, formatDateTime, humanize } from '../../utils/format'
import { ROLE_LABELS } from '../../config/roles'

export default function AuditLogTable({ items = [], loading, compact = false, empty = 'No audit events.' }) {
  const columns = [
    // Position in the tamper-evident hash chain (step 6)
    { key: 'chainSeq', header: '#', render: (e) => <span className="font-mono text-xs text-ink-3">{e.chainSeq ?? '—'}</span> },
    { key: 'createdAt', header: 'Time', render: (e) => <span className="text-ink-2">{formatDateTime(e.createdAt)}</span> },
    {
      key: 'actor',
      header: 'Actor',
      render: (e) =>
        e.actor ? (
          <div>
            <p className="text-ink">{e.actor.email}</p>
            <p className="text-xs text-ink-3">{ROLE_LABELS[e.actor.role] ?? e.actor.role}</p>
          </div>
        ) : (
          <span className="text-ink-3">Anonymous</span>
        ),
    },
    { key: 'action', header: 'Action', render: (e) => <span className="font-medium text-ink">{actionLabel(e.action)}</span> },
    { key: 'outcome', header: 'Outcome', render: (e) => <OutcomeBadge outcome={e.outcome} /> },
    { key: 'reason', header: 'Reason', render: (e) => <span className="text-ink-2">{e.reason ? humanize(e.reason) : '—'}</span> },
  ]
  if (!compact) {
    columns.push(
      { key: 'entity', header: 'Entity', render: (e) => (e.entityType ? <span className="text-xs text-ink-3">{e.entityType} · <span className="font-mono">{e.entityId?.slice(0, 8)}</span></span> : '—') },
      { key: 'ip', header: 'IP', render: (e) => <span className="font-mono text-xs text-ink-3">{e.ipAddress ?? '—'}</span> },
    )
  }
  return <DataTable columns={columns} rows={items} loading={loading} empty={empty} caption="Audit events" />
}
