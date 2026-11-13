import { useId } from 'react'
import { cn } from '../../utils/cn'

// options: [{ value, label }]
export default function Select({ label, options, error, hint, className, srOnlyLabel = false, ...props }) {
  const id = useId()
  const messageId = `${id}-message`
  const message = error || hint
  return (
    <div className={className}>
      <label htmlFor={id} className={cn('block text-sm font-medium text-ink', srOnlyLabel ? 'sr-only' : 'mb-1.5')}>
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={cn(
          'block h-11 w-full rounded-lg border bg-field px-3 text-sm text-ink focus:outline-none focus:ring-2 focus-visible:outline-none',
          error ? 'border-danger/60 focus:border-danger focus:ring-danger/25' : 'border-line hover:border-gold-deep/70 focus:border-gold focus:ring-gold/25',
        )}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {message && (
        <p id={messageId} className={cn('mt-1.5 text-sm', error ? 'text-danger' : 'text-ink-3')}>
          {message}
        </p>
      )}
    </div>
  )
}
