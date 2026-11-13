// Joins class names, skipping false/null/undefined:
// cn('px-4', isActive && 'bg-gold') → 'px-4 bg-gold' or 'px-4'
export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}
