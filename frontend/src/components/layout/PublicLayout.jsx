import { useState } from 'react'
import { Link, Outlet } from 'react-router'
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
        <span className="hidden text-sm text-slate-600 sm:inline">{user.fullName}</span>
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
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="LedgerLine home">
            <Logo />
          </Link>
          <HeaderActions />
        </div>
      </header>

      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800">
        Simulated money only – no real bank is connected.
      </div>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-slate-500 sm:px-6">
          LedgerLine is a learning project. No real money moves.
        </div>
      </footer>
    </div>
  )
}
