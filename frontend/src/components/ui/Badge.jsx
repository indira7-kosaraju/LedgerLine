import { cn } from '../../utils/cn'

const TONES = {
  neutral: 'bg-elevated text-ink-2 ring-line',
  brand: 'bg-gold-dark/60 text-gold-soft ring-gold-deep/60',
  success: 'bg-success/10 text-success ring-success/30',
  warning: 'bg-warning/10 text-warning ring-warning/30',
  danger: 'bg-danger/10 text-danger ring-danger/30',
}

// Small status label, e.g. <Badge tone="success" dot>Active</Badge> – always text, never colour alone.
export default function Badge({ tone = 'neutral', dot = false, className, children }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  )
}
