import { Link } from 'react-router'
import { buttonClasses } from '../ui/buttonStyles'
import { CheckCircleIcon } from '../icons'

// Shown to account holders who have not finished onboarding yet (step 4), wherever they would
// otherwise open an account or move money. UI only – the backend refuses those actions too.
export default function OnboardingNotice({ className }) {
  return (
    <div className={`rounded-xl border border-brand-200 bg-brand-50 px-6 py-8 text-center ${className ?? ''}`}>
      <CheckCircleIcon className="mx-auto size-8 text-brand-600" />
      <p className="mt-3 font-semibold text-slate-900">Complete your onboarding first</p>
      <p className="mt-1 text-sm text-slate-600">
        A few profile details and accepting the terms – then you can open accounts and move simulated money.
      </p>
      <Link to="/onboarding" className={`${buttonClasses()} mt-4`}>
        Start onboarding
      </Link>
    </div>
  )
}
