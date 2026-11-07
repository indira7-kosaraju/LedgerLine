import { useId } from 'react'
import { cn } from '../../utils/cn'

// options: [{ value, label }]
export default function Select({ label, options, className, srOnlyLabel = false, ...props }) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className={cn('block text-sm font-medium text-slate-700', srOnlyLabel ? 'sr-only' : 'mb-1.5')}>
        {label}
      </label>
      <select
        id={id}
        className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus-visible:outline-none"
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
