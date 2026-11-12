import { Outlet } from 'react-router'
import { useAuth } from '../../hooks/useAuth'
import PageHeader from '../ui/PageHeader'
import OnboardingNotice from '../domain/OnboardingNotice'
import { needsOnboarding } from '../../config/roles'

// Wraps the money-movement pages: holders who have not finished onboarding see the notice instead.
export default function OnboardingGate() {
  const { user } = useAuth()
  if (!needsOnboarding(user)) return <Outlet />
  return (
    <>
      <PageHeader title="Not available yet" description="Moving money needs a completed onboarding." />
      <OnboardingNotice />
    </>
  )
}
