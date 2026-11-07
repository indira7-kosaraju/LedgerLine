import { buttonClasses } from './buttonStyles'
import Spinner from './Spinner'

// `loading` disables the button and shows a spinner, so a form
// can't be submitted twice while a request is in flight.
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  type = 'button',
  className,
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}
