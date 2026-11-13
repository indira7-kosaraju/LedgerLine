import { cn } from '../../utils/cn'

// One number on a dashboard, e.g. "Total users 42".
// `value` undefined → still loading (shows a placeholder bar).
export default function StatCard({ label, value, hint, tone = 'default' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      {value === undefined ? (
        <div className="mt-2 h-8 w-24 animate-pulse rounded bg-slate-100" aria-label="Loading" />
      ) : (
        <p
          className={cn(
            'mt-1 text-2xl font-semibold tabular-nums tracking-tight',
            tone === 'danger' ? 'text-rose-600' : tone === 'warning' ? 'text-amber-600' : tone === 'success' ? 'text-emerald-600' : 'text-slate-900',
          )}
        >
          {value}
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}
