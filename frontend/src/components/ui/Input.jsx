import { useId } from 'react'
import { cn } from '../../utils/cn'

// Labelled text input with error and hint text, wired up for screen readers:
// aria-invalid marks the field as wrong, aria-describedby reads the error out.
export default function Input({ label, error, hint, id, leading, trailing, className, inputClassName, ...props }) {
  const autoId = useId()
  const inputId = id ?? autoId
  const messageId = `${inputId}-message`
  const message = error || hint

  return (
    <div className={className}>
      <label htmlFor={inputId} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative mt-1.5">
        {leading && <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-gold-soft">{leading}</span>}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={cn(
            'block h-11 w-full rounded-lg border bg-field px-3 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus-visible:outline-none disabled:bg-surface disabled:text-ink-4',
            error ? 'border-danger/60 focus:border-danger focus:ring-danger/25' : 'border-line hover:border-gold-deep/70 focus:border-gold focus:ring-gold/25',
            leading && 'pl-8',
            trailing && 'pr-11',
            inputClassName,
          )}
          {...props}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">{trailing}</div>}
      </div>
      {message && (
        <p id={messageId} className={cn('mt-1.5 text-sm', error ? 'text-danger' : 'text-ink-3')}>
          {message}
        </p>
      )}
    </div>
  )
}
