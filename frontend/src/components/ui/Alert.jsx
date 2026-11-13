import { cn } from '../../utils/cn'

const TONES = {
  info: 'border-gold-deep/60 bg-gold-dark/40 text-gold-bright',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-danger/40 bg-danger/10 text-danger',
}

// Errors are announced to screen readers immediately (role="alert").
export default function Alert({ tone = 'info', title, className, children }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-xl border px-4 py-3 text-sm', TONES[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && 'mt-1')}>{children}</div>}
    </div>
  )
}
