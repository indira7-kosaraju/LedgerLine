import { cn } from '../../utils/cn'

// Black & Gold buttons: metallic gold primary, gold-outlined secondary.
const VARIANTS = {
  primary:
    'gold-gradient font-semibold text-on-gold shadow-[0_10px_28px_-14px_rgb(212_166_58/0.75)] hover:brightness-110 active:brightness-95 disabled:opacity-50 disabled:hover:brightness-100',
  secondary:
    'bg-transparent text-gold-soft ring-1 ring-inset ring-gold-deep hover:bg-gold-dark/50 hover:text-gold-bright hover:ring-gold-line disabled:text-ink-4 disabled:ring-line disabled:hover:bg-transparent',
  ghost: 'text-ink-2 hover:bg-elevated hover:text-ink disabled:text-ink-4',
  danger: 'bg-danger font-semibold text-on-gold hover:bg-danger/85 disabled:opacity-50',
}

const SIZES = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

// Shared by <Button> and by router <Link>s that should look like buttons.
export function buttonClasses(variant = 'primary', size = 'md', className) {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition disabled:cursor-not-allowed',
    VARIANTS[variant],
    SIZES[size],
    className,
  )
}
