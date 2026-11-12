import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../hooks/useAuth'
import { useApi } from '../hooks/useApi'
import { useToast } from '../hooks/useToast'
import { getOnboarding, submitOnboarding } from '../api/onboarding.api'
import { fieldErrorsFromApi, normalisePhone, validateOnboardingDetails } from '../utils/validation'
import { formatDate, humanize } from '../utils/format'
import PageHeader from '../components/ui/PageHeader'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import ErrorState from '../components/ui/ErrorState'
import FullPageSpinner from '../components/ui/FullPageSpinner'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import { buttonClasses } from '../components/ui/buttonStyles'

const EMPTY = { dateOfBirth: '', phone: '', city: '', state: '', pinCode: '', occupation: '' }
const DETAIL_FIELDS = Object.keys(EMPTY)

// Short demo terms. Changing this text means raising TERMS_VERSION in backend/src/config/onboarding.js.
const TERMS = [
  'LedgerLine is a demonstration project. All money is simulated – nothing can be paid in or out for real.',
  'The details you enter are demo data. Do not enter real personal information.',
  'Accounts may be frozen or closed by an administrator, and demo data may be reset at any time.',
  'Every sign-in, account change and money movement is recorded in an audit log.',
]

function DemoWarning() {
  return (
    <Alert tone="warning" title="Demo application – do not enter real personal information" className="mb-6">
      LedgerLine is a learning project with simulated money. Use made-up details, for example date of birth <strong>1990-01-01</strong>,
      mobile number <strong>9000000000</strong> and PIN code <strong>560001</strong>.
    </Alert>
  )
}

function Steps({ step }) {
  const items = ['Your details', 'Review and accept the terms']
  return (
    <ol className="mb-6 flex flex-col gap-2 text-sm sm:flex-row sm:gap-6" aria-label="Onboarding steps">
      {items.map((label, i) => (
        <li key={label} className={i + 1 === step ? 'font-semibold text-brand-700' : 'text-slate-500'} aria-current={i + 1 === step ? 'step' : undefined}>
          {i + 1}. {label}
        </li>
      ))}
    </ol>
  )
}

function DetailsSummary({ details }) {
  const rows = [
    ['Date of birth', details.dateOfBirth],
    ['Mobile number', details.phone],
    ['City', details.city],
    ['State / union territory', details.state],
    ['PIN code', details.pinCode],
    ['Occupation', humanize(details.occupation)],
  ]
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-slate-500">{label}</dt>
          <dd className="font-medium text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Completed({ onboarding }) {
  return (
    <>
      <PageHeader title="Onboarding complete" description={`Approved on ${formatDate(onboarding.onboardedAt)}.`} />
      <Card>
        <CardBody>
          {onboarding.profile ? (
            <DetailsSummary details={onboarding.profile} />
          ) : (
            <p className="text-sm text-slate-600">Your account was set up before onboarding was introduced – there is nothing more to do.</p>
          )}
          <Link to="/accounts" className={`${buttonClasses()} mt-6`}>
            Go to my accounts
          </Link>
        </CardBody>
      </Card>
    </>
  )
}

export default function OnboardingPage() {
  const { updateUser } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const onboarding = useApi((opts) => getOnboarding(opts))

  const [step, setStep] = useState(1)
  const [values, setValues] = useState(EMPTY)
  const [accepted, setAccepted] = useState(false)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (onboarding.error) return <ErrorState error={onboarding.error} onRetry={onboarding.reload} />
  if (!onboarding.data) return <FullPageSpinner label="Loading onboarding…" />
  if (onboarding.data.status === 'APPROVED') return <Completed onboarding={onboarding.data} />

  const { requirements } = onboarding.data
  const details = { ...values, phone: values.phone ? `+91${normalisePhone(values.phone)}` : '', city: values.city.trim().replace(/\s+/g, ' '), pinCode: values.pinCode.trim() }

  function handleChange(event) {
    const { name, value } = event.target
    setValues((v) => ({ ...v, [name]: value }))
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }))
  }

  function handleContinue(event) {
    event.preventDefault()
    const found = validateOnboardingDetails(values, requirements)
    setErrors(found)
    setFormError(null)
    if (!Object.keys(found).length) setStep(2)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!accepted) {
      setErrors({ acceptTerms: 'You must accept the terms to continue' })
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const result = await submitOnboarding({ ...details, acceptTerms: true, termsVersion: requirements.termsVersion })
      updateUser(result.user)
      toast.success('Onboarding complete – you can now open your first account.')
      navigate('/dashboard', { replace: true })
    } catch (error) {
      if (error.code === 'ONBOARDING_ALREADY_COMPLETE') {
        onboarding.reload()
        return
      }
      const fieldErrors = fieldErrorsFromApi(error)
      setErrors(fieldErrors)
      if (DETAIL_FIELDS.some((f) => fieldErrors[f])) setStep(1)
      if (fieldErrors.termsVersion) {
        setAccepted(false)
        onboarding.reload() // the terms changed – show the new version
      }
      if (!Object.keys(fieldErrors).length || fieldErrors.termsVersion) setFormError(fieldErrors.termsVersion ?? error.message)
      setSubmitting(false)
    }
  }

  const stateOptions = [{ value: '', label: 'Choose…' }, ...requirements.states.map((s) => ({ value: s, label: s }))]
  const occupationOptions = [{ value: '', label: 'Choose…' }, ...requirements.occupations.map((o) => ({ value: o, label: humanize(o) }))]

  return (
    <>
      <PageHeader title="Complete your onboarding" description="Two short steps – then you can open accounts and move simulated money." />
      <DemoWarning />
      <Steps step={step} />
      {formError && (
        <Alert tone="danger" className="mb-5">
          {formError}
        </Alert>
      )}

      {step === 1 ? (
        <Card>
          <CardHeader title="Your details" description={`You must be at least ${requirements.minimumAge} years old.`} />
          <CardBody>
            <form onSubmit={handleContinue} noValidate className="grid gap-5 sm:grid-cols-2">
              <Input label="Date of birth" name="dateOfBirth" type="date" value={values.dateOfBirth} onChange={handleChange} error={errors.dateOfBirth} autoFocus />
              <Input label="Mobile number" name="phone" type="tel" inputMode="numeric" leading="+91" placeholder="9000000000" value={values.phone} onChange={handleChange} error={errors.phone} autoComplete="off" />
              <Input label="City" name="city" value={values.city} onChange={handleChange} error={errors.city} autoComplete="off" />
              <Select label="State / union territory" name="state" options={stateOptions} value={values.state} onChange={handleChange} error={errors.state} />
              <Input label="PIN code" name="pinCode" inputMode="numeric" maxLength={6} value={values.pinCode} onChange={handleChange} error={errors.pinCode} autoComplete="off" />
              <Select label="Occupation" name="occupation" options={occupationOptions} value={values.occupation} onChange={handleChange} error={errors.occupation} />
              <div className="sm:col-span-2">
                <Button type="submit">Continue</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Review and accept the terms" description={`Terms version ${requirements.termsVersion}`} />
          <CardBody>
            <DetailsSummary details={details} />
            <ul className="mt-6 list-disc space-y-1 rounded-lg bg-slate-50 py-4 pl-8 pr-4 text-sm text-slate-700">
              {TERMS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
              <div>
                <label className="flex items-start gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="acceptTerms"
                    checked={accepted}
                    onChange={(e) => {
                      setAccepted(e.target.checked)
                      setErrors((er) => ({ ...er, acceptTerms: undefined }))
                    }}
                    aria-invalid={errors.acceptTerms ? true : undefined}
                    className="mt-0.5 size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  I have read and accept the terms (version {requirements.termsVersion}).
                </label>
                {errors.acceptTerms && <p className="mt-1.5 text-sm text-rose-600">{errors.acceptTerms}</p>}
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setStep(1)} disabled={submitting}>
                  Back
                </Button>
                <Button type="submit" loading={submitting}>
                  {submitting ? 'Completing…' : 'Complete onboarding'}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}
    </>
  )
}
