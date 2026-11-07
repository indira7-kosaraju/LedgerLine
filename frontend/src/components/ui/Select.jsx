import { useId } from 'react'
import { cn } from '../../utils/cn'

// options: [{ value, label }]
export default function Select({ label, options, error, hint, className, srOnlyLabel = false, ...props }) {
  const id = useId()
  const messageId = `${id}-message`
  const message = error || hint
  return (
    <div className={className}>
      <label htmlFor={id} className={cn('block text-sm font-medium text-slate-700', srOnlyLabel ? 'sr-only' : 'mb-1.5')}>
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={cn(
          'block h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus-visible:outline-none',
          error ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20' : 'border-slate-300 focus:border-brand-500 focus:ring-brand-500/20',
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
        <p id={messageId} className={cn('mt-1.5 text-sm', error ? 'text-rose-600' : 'text-slate-500')}>
          {message}
        </p>
      )}
    </div>
  )
}
