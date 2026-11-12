import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import ErrorBoundary from '../ErrorBoundary'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { navItemsFor } from '../../config/navigation'
import { ROLE_LABELS } from '../../config/roles'
import { CloseIcon, MenuIcon } from '../icons'
import { cn } from '../../utils/cn'
import Logo from '../Logo'
import Button from '../ui/Button'

function SidebarContent({ onNavigate }) {
  const { user, logout } = useAuth()
  const toast = useToast()
  const [signingOut, setSigningOut] = useState(false)

  async function handleLogout() {
    setSigningOut(true)
    await logout()
    toast.info('You have been signed out.')
  }

  return (
    <div className="flex h-full flex-col bg-brand-950 text-slate-300">
      <div className="flex h-16 items-center px-5">
        <Logo light />
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main">
        {navItemsFor(user).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white',
              )
            }
          >
            <Icon className="size-5 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <p className="truncate text-sm font-medium text-white">{user.fullName}</p>
        <p className="truncate text-xs text-slate-400">{user.email}</p>
        <span className="mt-2 inline-block rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-slate-200">
          {ROLE_LABELS[user.role] ?? user.role}
        </span>
        <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={handleLogout} loading={signingOut}>
          Sign out
        </Button>
      </div>
    </div>
  )
}

// Shell for every signed-in page: sidebar (desktop) / slide-out menu (mobile) + top bar.
export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)
  const location = useLocation()

  // Escape closes the mobile menu.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event) => event.key === 'Escape' && setMenuOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block lg:w-64">
        <SidebarContent />
      </aside>

      {/* Mobile slide-out menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Main menu">
          <div className="absolute inset-0 bg-slate-900/50" onClick={closeMenu} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%]">
            <button type="button" onClick={closeMenu} className="absolute right-3 top-4 z-10 rounded-md p-1.5 text-slate-300 hover:bg-white/10" aria-label="Close menu">
              <CloseIcon />
            </button>
            <SidebarContent onNavigate={closeMenu} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
        <button type="button" onClick={() => setMenuOpen(true)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
          <MenuIcon />
        </button>
        <div className="lg:hidden">
          <Logo />
        </div>
        <span className="ml-auto rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
          Simulated money
        </span>
      </header>

      <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-7xl">
          {/* A crash in one page shows an error card instead of a blank app; resets on navigation. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  )
}
