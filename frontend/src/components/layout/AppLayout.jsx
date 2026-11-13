import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import ErrorBoundary from '../ErrorBoundary'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { navItemsFor } from '../../config/navigation'
import { ROLE_LABELS } from '../../config/roles'
import { CloseIcon, LogoutIcon, MenuIcon } from '../icons'
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
    <div className="flex h-full flex-col border-r border-line-soft bg-sidebar text-ink-2">
      <div className="flex h-20 items-center border-b border-line-soft px-6">
        <Logo />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Main">
        {navItemsFor(user).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                isActive
                  ? 'gold-gradient text-on-gold shadow-[0_8px_22px_-12px_rgb(212_166_58/0.8)]'
                  : 'text-ink-2 hover:bg-elevated hover:text-ink',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('size-5 shrink-0', isActive ? 'text-on-gold' : 'text-gold-soft/80 group-hover:text-gold-soft')} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-line-soft p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-gold-deep bg-gold-dark/60 text-sm font-semibold text-gold-soft" aria-hidden="true">
            {user.fullName.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{user.fullName}</p>
            <p className="truncate text-xs text-ink-3">{user.email}</p>
          </div>
        </div>
        <span className="mt-3 inline-block rounded-full bg-gold-dark/60 px-2 py-0.5 text-xs font-medium text-gold-soft ring-1 ring-inset ring-gold-deep/60">
          {ROLE_LABELS[user.role] ?? user.role}
        </span>
        <Button variant="secondary" size="md" className="mt-4 w-full" onClick={handleLogout} loading={signingOut}>
          {!signingOut && <LogoutIcon className="size-4" />}
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
    <div className="min-h-screen bg-canvas lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block lg:w-64">
        <SidebarContent />
      </aside>

      {/* Mobile slide-out menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Main menu">
          <div className="absolute inset-0 bg-black/70" onClick={closeMenu} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%]">
            <button type="button" onClick={closeMenu} className="absolute right-3 top-6 z-10 rounded-md p-1.5 text-ink-2 hover:bg-elevated hover:text-ink" aria-label="Close menu">
              <CloseIcon />
            </button>
            <SidebarContent onNavigate={closeMenu} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line-soft bg-canvas/85 px-4 backdrop-blur sm:px-6 lg:px-8">
        <button type="button" onClick={() => setMenuOpen(true)} className="rounded-md p-2 text-gold-soft hover:bg-elevated lg:hidden" aria-label="Open menu">
          <MenuIcon />
        </button>
        <div className="lg:hidden">
          <Logo />
        </div>
        <span className="ml-auto rounded-full bg-gold-dark/50 px-3 py-1 text-xs font-medium text-gold-soft ring-1 ring-inset ring-gold-deep/60">
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
