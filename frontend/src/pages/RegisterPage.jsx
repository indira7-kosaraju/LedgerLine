import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { PASSWORD_RULES, fieldErrorsFromApi, validateRegister } from '../utils/validation'
import { cn } from '../utils/cn'
import AuthCard from '../components/layout/AuthCard'
import Input from '../components/ui/Input'
import PasswordInput from '../components/ui/PasswordInput'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'

// Live checklist under the password field.
function PasswordChecklist({ password }) {
  return (
    <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password)
        return (
          <li key={rule.id} className={cn('flex items-center gap-1.5', ok ? 'text-emerald-700' : 'text-slate-500')}>
            <span aria-hidden="true">{ok ? '✓' : '○'}</span>
            {rule.label}
            <span className="sr-only">{ok ? '(met)' : '(not met)'}</span>
          </li>
        )
      })}
    </ul>
  )
}

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
      toast.success(`Account created. Welcome to LedgerLine, ${user.fullName.split(' ')[0]}!`)
      // <GuestRoute> redirects to the app now that we're signed in.
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
      title="Create your account"
      subtitle="Start moving simulated money in minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" state={location.state} className="font-medium text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </>
      }
    >
      {formError && (
        <Alert tone="danger" className="mb-5">
          {formError}
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <Input label="Full name" name="fullName" autoComplete="name" value={values.fullName} onChange={handleChange} error={errors.fullName} autoFocus />
        <Input label="Email" name="email" type="email" autoComplete="email" value={values.email} onChange={handleChange} error={errors.email} />
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
        <Button type="submit" className="w-full" loading={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
        <p className="text-xs text-slate-500">
          New accounts are account holders. Administrator and auditor accounts are created by the system operator.
        </p>
      </form>
    </AuthCard>
  )
}
