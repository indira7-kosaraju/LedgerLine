import { useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { fieldErrorsFromApi, validateLogin } from '../utils/validation'
import AuthCard from '../components/layout/AuthCard'
import Input from '../components/ui/Input'
import PasswordInput from '../components/ui/PasswordInput'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import DemoPersonas from '../components/domain/DemoPersonas'

export default function LoginPage() {
  const { login } = useAuth()
  const toast = useToast()
  const location = useLocation()

  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const redirectedHere = Boolean(location.state?.from)
  const passwordRef = useRef(null)
  const [persona, setPersona] = useState(null) // the demo persona whose email was filled in (display only)

  // "Use account": fills in the persona's public demo email, clears any typed password and moves focus to the
  // password field. It does NOT sign in – the visitor types the password and the normal sign-in flow runs.
  function handleUsePersona(p) {
    setValues({ email: p.email, password: '' })
    setErrors({})
    setFormError(null)
    setPersona(p)
    passwordRef.current?.focus()
  }

  function handleChange(event) {
    const { name, value } = event.target
    setValues((v) => ({ ...v, [name]: value }))
    if (name === 'email') setPersona(null)
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const clientErrors = validateLogin(values)
    setErrors(clientErrors)
    setFormError(null)
    if (Object.keys(clientErrors).length) return

    setSubmitting(true)
    try {
      const user = await login({ email: values.email.trim(), password: values.password })
      toast.success(`Welcome back, ${user.fullName}.`)
      // No navigate() here: <GuestRoute> sees we're signed in and redirects.
    } catch (error) {
      // 401 → "Invalid email or password", 429 → too many attempts, 0 → server down.
      setFormError(error.message)
      setErrors(fieldErrorsFromApi(error))
      setValues((v) => ({ ...v, password: '' }))
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to access your LedgerLine account."
      footer={
        <>
          <p className="text-center text-sm text-ink-2">
            New to LedgerLine?{' '}
            <Link to="/register" state={location.state} className="font-medium text-gold-soft hover:text-gold-bright">
              Create an account
            </Link>
          </p>
          <DemoPersonas onSelect={handleUsePersona} selectedEmail={persona?.email} />
        </>
      }
    >
      {redirectedHere && !formError && (
        <Alert tone="info" className="mb-5">
          Please sign in to continue.
        </Alert>
      )}
      {formError && (
        <Alert tone="danger" className="mb-5">
          {formError}
        </Alert>
      )}

      {/* noValidate: we show our own messages instead of the browser's popups */}
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <Input
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={handleChange}
          error={errors.email}
          autoFocus
        />
        <PasswordInput
          ref={passwordRef}
          label="Password"
          name="password"
          autoComplete="current-password"
          value={values.password}
          onChange={handleChange}
          error={errors.password}
        />
        <p className="sr-only" aria-live="polite">
          {persona ? `Email filled in for ${persona.name}. Enter the password to sign in.` : ''}
        </p>
        {persona && <p className="-mt-2 text-xs text-gold-soft">Demo account selected: {persona.name}. Enter the password to sign in.</p>}
        <Button type="submit" className="w-full" size="lg" loading={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthCard>
  )
}
