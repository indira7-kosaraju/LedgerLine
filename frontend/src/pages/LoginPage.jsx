import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { fieldErrorsFromApi, validateLogin } from '../utils/validation'
import AuthCard from '../components/layout/AuthCard'
import Input from '../components/ui/Input'
import PasswordInput from '../components/ui/PasswordInput'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'

export default function LoginPage() {
  const { login } = useAuth()
  const toast = useToast()
  const location = useLocation()

  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const redirectedHere = Boolean(location.state?.from)

  function handleChange(event) {
    const { name, value } = event.target
    setValues((v) => ({ ...v, [name]: value }))
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
      toast.success(`Welcome back, ${user.fullName.split(' ')[0]}.`)
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
      title="Sign in"
      subtitle="Access your LedgerLine accounts."
      footer={
        <>
          New to LedgerLine?{' '}
          <Link to="/register" state={location.state} className="font-medium text-brand-600 hover:text-brand-700">
            Create an account
          </Link>
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
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={handleChange}
          error={errors.email}
          autoFocus
        />
        <PasswordInput
          label="Password"
          name="password"
          autoComplete="current-password"
          value={values.password}
          onChange={handleChange}
          error={errors.password}
        />
        <Button type="submit" className="w-full" loading={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthCard>
  )
}
