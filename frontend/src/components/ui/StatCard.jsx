import { cn } from '../../utils/cn'

// One number on a dashboard, e.g. "Total users 42".
// `value` undefined → still loading (shows a placeholder bar). `icon` (optional) is shown in a gold tile.
export default function StatCard({ label, value, hint, tone = 'default', icon: Icon }) {
  return (
    <div className="surface-gradient rounded-2xl border border-line p-5 transition-colors hover:border-gold-deep/70">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-2">{label}</p>
        {Icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-gold-deep/60 bg-gold-dark/50 text-gold-soft" aria-hidden="true">
            <Icon className="size-5" />
          </span>
        )}
      </div>
      {value === undefined ? (
        <div className="mt-2 h-8 w-24 animate-pulse rounded bg-elevated" aria-label="Loading" />
      ) : (
        <p
          className={cn(
            'mt-1 text-3xl font-semibold tabular-nums tracking-tight',
            tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-ink',
          )}
        >
          {value}
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  )
}
