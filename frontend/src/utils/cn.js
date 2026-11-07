// Joins class names, skipping false/null/undefined:
// cn('px-4', isActive && 'bg-brand-600') → 'px-4 bg-brand-600' or 'px-4'
export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}
