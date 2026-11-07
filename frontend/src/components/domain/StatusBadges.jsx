import Badge from '../ui/Badge'
import { humanize } from '../../utils/format'

const ACCOUNT_STATUS_TONES = { ACTIVE: 'success', FROZEN: 'warning', CLOSED: 'neutral' }
const TXN_TYPE_TONES = { DEPOSIT: 'success', WITHDRAWAL: 'danger', TRANSFER: 'brand' }
const OUTCOME_TONES = { SUCCESS: 'success', REFUSED: 'danger', ERROR: 'warning' }

export function AccountStatusBadge({ status }) {
  return (
    <Badge tone={ACCOUNT_STATUS_TONES[status] ?? 'neutral'} dot>
      {humanize(status)}
    </Badge>
  )
}

export function TransactionTypeBadge({ type }) {
  return <Badge tone={TXN_TYPE_TONES[type] ?? 'neutral'}>{humanize(type)}</Badge>
}

export function OutcomeBadge({ outcome }) {
  return (
    <Badge tone={OUTCOME_TONES[outcome] ?? 'neutral'} dot>
      {humanize(outcome)}
    </Badge>
  )
}
