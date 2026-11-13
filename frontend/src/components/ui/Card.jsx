import { cn } from '../../utils/cn'

export function Card({ className, children, ...props }) {
  return (
    <div className={cn('rounded-2xl border border-line bg-card shadow-[0_20px_40px_-28px_rgb(0_0_0/0.9)]', className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ title, description, action, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4', className)}>
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function CardBody({ className, children }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>
}
