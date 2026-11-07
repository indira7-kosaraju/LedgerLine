import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../../hooks/useAuth'
import FullPageSpinner from '../ui/FullPageSpinner'

// Only allow an internal path like "/accounts/123" – never "//evil.com" or
// "https://evil.com" – so a crafted link can't redirect users off the site.
function safeRedirect(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/dashboard'
}

// Wraps /login and /register: signed-in users are sent on to the app.
// This is also what moves the user forward right after a successful login.
export default function GuestRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageSpinner label="Checking your session…" />
  if (status === 'authenticated') return <Navigate to={safeRedirect(location.state?.from)} replace />

  return <Outlet />
}
