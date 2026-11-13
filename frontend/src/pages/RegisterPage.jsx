import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { fieldErrorsFromApi, validateRegister } from '../utils/validation'
import AuthCard from '../components/layout/AuthCard'
import Input from '../components/ui/Input'
import PasswordInput from '../components/ui/PasswordInput'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import PasswordChecklist from '../components/ui/PasswordChecklist'

export default function RegisterPage() {
  const { register } = useAuth()
  const toast = useToast()
  const location = useLocation()

  const [values, setValues] = useState({ fullName: '', email: '', password: '', confirmPassword: '' })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  function handleChange(event) {
    const { name, value } = event.target
    setValues((v) => ({ ...v, [name]: value }))
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const clientErrors = validateRegister(values)
    setErrors(clientErrors)
    setFormError(null)
    if (Object.keys(clientErrors).length) return

    setSubmitting(true)
    try {
      // confirmPassword is only checked here – the backend rejects unknown fields.
      const user = await register({ fullName: values.fullName.trim(), email: values.email.trim(), password: values.password })
      toast.success(`Welcome to LedgerLine, ${user.fullName}! One more step: complete your onboarding.`)
      // <GuestRoute> redirects to /onboarding now that we're signed in.
    } catch (error) {
      if (error.code === 'EMAIL_TAKEN') {
        setErrors({ email: error.message })
      } else {
        setErrors(fieldErrorsFromApi(error))
        setFormError(error.message)
      }
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title="Create your LedgerLine account"
      subtitle="Get started with secure, simulated-money banking."
      footer={
        <p className="text-center text-sm text-ink-2">
          Already have an account?{' '}
          <Link to="/login" state={location.state} className="font-medium text-gold-soft hover:text-gold-bright">
            Sign in
          </Link>
        </p>
      }
    >
      {formError && (
        <Alert tone="danger" className="mb-5">
          {formError}
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <Input
          label="Full name"
          name="fullName"
          autoComplete="name"
          value={values.fullName}
          onChange={handleChange}
          error={errors.fullName}
          autoFocus
        />
        <Input
          label="Email address"
          name="email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={handleChange}
          error={errors.email}
        />
        <div>
          <PasswordInput
            label="Password"
            name="password"
            autoComplete="new-password"
            value={values.password}
            onChange={handleChange}
            error={errors.password}
          />
          <PasswordChecklist password={values.password} />
        </div>
        <PasswordInput
          label="Confirm password"
          name="confirmPassword"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={handleChange}
          error={errors.confirmPassword}
        />
        <Button type="submit" className="w-full" size="lg" loading={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
        <p className="text-xs text-ink-3">
          After signing up you complete a short onboarding before opening accounts. New accounts are account holders; administrator and auditor
          accounts are created by the system operator.
        </p>
      </form>
    </AuthCard>
  )
}
