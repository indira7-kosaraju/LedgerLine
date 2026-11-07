import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../../hooks/useAuth'
import FullPageSpinner from '../ui/FullPageSpinner'

// Wraps routes that need a signed-in user.
//   <Route element={<ProtectedRoute />}>                     any signed-in user
//   <Route element={<ProtectedRoute roles={['ADMIN']} />}>   only these roles
//
// This only controls what the UI SHOWS. Real protection is on the backend,
// which re-checks the session and role on every API request.
export default function ProtectedRoute({ roles }) {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageSpinner label="Checking your session…" />

  if (status !== 'authenticated') {
    // Remember where the user wanted to go, so we can send them back after login.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/forbidden" replace />
  }

  return <Outlet />
}
