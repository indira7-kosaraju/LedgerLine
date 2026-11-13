import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import ErrorBoundary from '../ErrorBoundary'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { buttonClasses } from '../ui/buttonStyles'
import Button from '../ui/Button'
import Logo from '../Logo'

function HeaderActions() {
  const { status, user, logout } = useAuth()
  const toast = useToast()
  const [signingOut, setSigningOut] = useState(false)

  if (status === 'loading') return null

  if (status === 'authenticated') {
    async function handleLogout() {
      setSigningOut(true)
      await logout()
      toast.info('You have been signed out.')
    }
    return (
      <div className="flex items-center gap-2">
        <span className="hidden text-sm text-ink-2 sm:inline">{user.fullName}</span>
        <Link to="/dashboard" className={buttonClasses('secondary', 'sm')}>
          Dashboard
        </Link>
        <Button variant="ghost" size="sm" onClick={handleLogout} loading={signingOut}>
          Sign out
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Link to="/login" className={buttonClasses('ghost', 'sm')}>
        Sign in
      </Link>
      <Link to="/register" className={buttonClasses('primary', 'sm')}>
        Create account
      </Link>
    </div>
  )
}

// Layout for pages outside the signed-in app (home, sign in, register, errors).
// <Outlet /> is where React Router renders the matched child page.
export default function PublicLayout() {
  const location = useLocation()
  // The sign-in and registration cards show the large brand mark themselves.
  const authPage = ['/login', '/register'].includes(location.pathname)
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line-soft bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          {authPage ? (
            <Link to="/" className="text-sm font-medium text-ink-2 hover:text-gold-soft">
              ← Home
            </Link>
          ) : (
            <Link to="/" aria-label="LedgerLine home">
              <Logo />
            </Link>
          )}
          <HeaderActions />
        </div>
      </header>

      <div className="border-b border-gold-deep/40 bg-gold-dark/40 px-4 py-2 text-center text-xs font-medium text-gold-soft">
        Simulated money only – no real bank is connected.
      </div>

      <main className="flex-1">
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer className="border-t border-line-soft bg-sidebar">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-ink-3 sm:px-6">
          LedgerLine is a learning project. No real money moves.
        </div>
      </footer>
    </div>
  )
}
