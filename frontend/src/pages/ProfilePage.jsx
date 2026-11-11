import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { changePassword } from '../api/auth.api'
import { ROLE_LABELS } from '../config/roles'
import { fieldErrorsFromApi, validateChangePassword } from '../utils/validation'
import PageHeader from '../components/ui/PageHeader'
import PasswordInput from '../components/ui/PasswordInput'
import PasswordChecklist from '../components/ui/PasswordChecklist'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import { Card, CardBody, CardHeader } from '../components/ui/Card'

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' }

// Every role: who am I, and change my own password.
export default function ProfilePage() {
  const { user } = useAuth()
  const toast = useToast()

  const [values, setValues] = useState(EMPTY)
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
    const clientErrors = validateChangePassword(values)
    setErrors(clientErrors)
    setFormError(null)
    if (Object.keys(clientErrors).length) return

    setSubmitting(true)
    try {
      // confirmPassword is only checked here – the backend rejects unknown fields.
      await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword })
      setValues(EMPTY)
      toast.success('Password changed. You were signed out on all other devices.')
    } catch (error) {
      const fieldErrors = fieldErrorsFromApi(error)
      setErrors(fieldErrors)
      if (!Object.keys(fieldErrors).length) setFormError(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader title="Profile" description="Your sign-in details and password." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your details" />
          <CardBody>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Full name</dt>
                <dd className="font-medium text-slate-900">{user.fullName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Email</dt>
                <dd className="font-medium text-slate-900">{user.email}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Role</dt>
                <dd className="font-medium text-slate-900">{ROLE_LABELS[user.role] ?? user.role}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Change password" description="Changing it signs you out on every other device." />
          <CardBody>
            {formError && (
              <Alert tone="danger" className="mb-5">
                {formError}
              </Alert>
            )}
            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <PasswordInput
                label="Current password"
                name="currentPassword"
                autoComplete="current-password"
                value={values.currentPassword}
                onChange={handleChange}
                error={errors.currentPassword}
              />
              <div>
                <PasswordInput
                  label="New password"
                  name="newPassword"
                  autoComplete="new-password"
                  value={values.newPassword}
                  onChange={handleChange}
                  error={errors.newPassword}
                />
                <PasswordChecklist password={values.newPassword} />
              </div>
              <PasswordInput
                label="Confirm new password"
                name="confirmPassword"
                autoComplete="new-password"
                value={values.confirmPassword}
                onChange={handleChange}
                error={errors.confirmPassword}
              />
              <Button type="submit" loading={submitting}>
                {submitting ? 'Changing password…' : 'Change password'}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
