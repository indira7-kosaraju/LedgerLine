import { cn } from '../utils/cn'

export default function Logo({ className, light = false }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#1d3fbf" />
        <path d="M10 8v16h12" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 13h7M15 18h5" fill="none" stroke="#6ee7b7" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className={cn('text-lg font-semibold tracking-tight', light ? 'text-white' : 'text-slate-900')}>LedgerLine</span>
    </span>
  )
}
