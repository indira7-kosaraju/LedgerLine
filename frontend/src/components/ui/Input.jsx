import { useId } from 'react'
import { cn } from '../../utils/cn'

// Labelled text input with error and hint text, wired up for screen readers:
// aria-invalid marks the field as wrong, aria-describedby reads the error out.
export default function Input({ label, error, hint, id, trailing, className, inputClassName, ...props }) {
  const autoId = useId()
  const inputId = id ?? autoId
  const messageId = `${inputId}-message`
  const message = error || hint

  return (
    <div className={className}>
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={cn(
            'block h-10 w-full rounded-lg border bg-white px-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus-visible:outline-none disabled:bg-slate-50 disabled:text-slate-500',
            error ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20' : 'border-slate-300 focus:border-brand-500 focus:ring-brand-500/20',
            trailing && 'pr-11',
            inputClassName,
          )}
          {...props}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">{trailing}</div>}
      </div>
      {message && (
        <p id={messageId} className={cn('mt-1.5 text-sm', error ? 'text-rose-600' : 'text-slate-500')}>
          {message}
        </p>
      )}
    </div>
  )
}
