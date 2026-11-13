import Button from './Button'

// "Showing 21–40 of 57"   [Previous] [Next]
export default function Pagination({ page, limit, total, onPageChange, disabled }) {
  if (!total) return null
  const pages = Math.max(1, Math.ceil(total / limit))
  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  return (
    <nav className="flex items-center justify-between gap-4 border-t border-line-soft px-4 py-3 text-sm" aria-label="Pagination">
      <p className="text-ink-3">
        Showing <span className="font-medium text-ink-2">{from}</span>–<span className="font-medium text-ink-2">{to}</span> of{' '}
        <span className="font-medium text-ink-2">{total}</span>
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" size="sm" disabled={disabled || page >= pages} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  )
}
