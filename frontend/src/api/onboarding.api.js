import { api } from './client'

// GET /api/onboarding → { status, onboardedAt, termsAcceptedVersion, termsAcceptedAt, profile, requirements }
// `requirements` (terms version, states, occupations, minimum age) comes from the server, so the form
// always follows the rules the server applies.
export async function getOnboarding({ signal } = {}) {
  const { data } = await api.get('/onboarding', { signal })
  return data.onboarding
}

// POST /api/onboarding → { user, onboarding } – approved automatically when everything is valid.
export async function submitOnboarding(details) {
  const { data } = await api.post('/onboarding', details)
  return data
}
