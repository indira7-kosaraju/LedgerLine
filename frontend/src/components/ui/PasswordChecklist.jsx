import { PASSWORD_RULES } from '../../utils/validation'
import { cn } from '../../utils/cn'

// Live checklist under the password field.
export default function PasswordChecklist({ password }) {
  return (
    <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password)
        return (
          <li key={rule.id} className={cn('flex items-center gap-1.5', ok ? 'text-success' : 'text-ink-3')}>
            <span aria-hidden="true">{ok ? '✓' : '○'}</span>
            {rule.label}
            <span className="sr-only">{ok ? '(met)' : '(not met)'}</span>
          </li>
        )
      })}
    </ul>
  )
}
