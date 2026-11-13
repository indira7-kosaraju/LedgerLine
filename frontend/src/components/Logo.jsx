import { useId } from 'react'
import { cn } from '../utils/cn'

// Gold bank mark + wordmark. `size="lg"` stacks a large version (sign-in and registration pages).
// The wordmark is always light on the dark theme.
export default function Logo({ className, size = 'md' }) {
  const gradientId = useId()
  const large = size === 'lg'
  return (
    <span className={cn('inline-flex items-center', large ? 'flex-col gap-3' : 'gap-2.5', className)}>
      <svg viewBox="0 0 32 32" className={cn('shrink-0', large ? 'size-16' : 'size-8')} aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f7d477" />
            <stop offset="45%" stopColor="#e8bc55" />
            <stop offset="75%" stopColor="#d4a63a" />
            <stop offset="100%" stopColor="#9b7429" />
          </linearGradient>
        </defs>
        <g fill={`url(#${gradientId})`}>
          <path d="M16 3 3.5 9.6V12h25V9.6zm0 3.1 6.6 3.5H9.4z" />
          <rect x="6" y="13.5" width="3" height="10" rx="0.6" />
          <rect x="11.7" y="13.5" width="3" height="10" rx="0.6" />
          <rect x="17.3" y="13.5" width="3" height="10" rx="0.6" />
          <rect x="23" y="13.5" width="3" height="10" rx="0.6" />
          <rect x="3.5" y="25" width="25" height="3.2" rx="0.8" />
        </g>
      </svg>
      <span className={cn('font-semibold tracking-tight text-ink', large ? 'text-4xl sm:text-5xl' : 'text-lg')}>
        Ledger<span className="bg-gradient-to-br from-gold-bright via-gold-soft to-gold bg-clip-text text-transparent">Line</span>
      </span>
    </span>
  )
}
