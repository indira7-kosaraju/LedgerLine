import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { buttonClasses } from '../ui/buttonStyles'
import Button from '../ui/Button'
import Logo from '../Logo'
import { CloseIcon, MenuIcon } from '../icons'
import { cn } from '../../utils/cn'

// Section links of the homepage (ids are on the sections in HomePage.jsx).
const HOME_SECTIONS = [
  { id: 'top', label: 'Home' },
  { id: 'features', label: 'Features' },
  { id: 'security', label: 'Security' },
  { id: 'how-it-works', label: 'How it Works' },
  { id: 'about', label: 'About' },
]

// Highlights the section currently in view (the gold underline).
function useActiveSection() {
  const [active, setActive] = useState('top')
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible) setActive(visible.target.id)
      },
      { rootMargin: '-35% 0px -55% 0px', threshold: [0, 0.25, 0.5, 1] },
    )
    HOME_SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])
  return active
}

function Actions({ onNavigate, stacked = false }) {
  const { status, logout } = useAuth()
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
      <div className={cn('flex gap-3', stacked && 'flex-col')}>
        <Link to="/dashboard" onClick={onNavigate} className={buttonClasses('primary', 'lg', 'h-11 px-5')}>
          Dashboard
        </Link>
        <Button variant="secondary" size="lg" className="h-11 px-5 text-ink" onClick={handleLogout} loading={signingOut}>
          Sign out
        </Button>
      </div>
    )
  }
  return (
    <div className={cn('flex gap-3', stacked && 'flex-col')}>
      <Link to="/login" onClick={onNavigate} className={buttonClasses('secondary', 'lg', 'h-11 px-5 text-ink hover:text-ink')}>
        Sign in
      </Link>
      <Link to="/register" onClick={onNavigate} className={buttonClasses('primary', 'lg', 'h-11 px-5')}>
        Create account
      </Link>
    </div>
  )
}

export default function HomeHeader() {
  const active = useActiveSection()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header className="sticky top-0 z-40 border-b border-line-soft bg-[#080808]/90 backdrop-blur">
      <div className="mx-auto flex h-[4.75rem] max-w-[1480px] items-center justify-between gap-6 px-5 sm:px-8 lg:px-12 xl:px-20">
        <a href="#top" aria-label="LedgerLine home" className="shrink-0">
          <Logo className="[&>span]:text-2xl [&>svg]:size-10" />
        </a>

        <nav aria-label="Homepage sections" className="hidden lg:block">
          <ul className="flex items-center gap-10">
            {HOME_SECTIONS.map(({ id, label }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  aria-current={active === id ? 'location' : undefined}
                  className={cn(
                    'relative block py-2 text-[0.95rem] font-medium transition-colors after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:rounded-full after:transition-opacity',
                    active === id ? 'text-gold-soft after:bg-gold-soft after:opacity-100' : 'text-ink after:opacity-0 hover:text-gold-bright',
                  )}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden lg:block">
          <Actions />
        </div>

        <button
          type="button"
          className="rounded-md p-2 text-gold-soft hover:bg-elevated lg:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="home-mobile-menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>
      </div>

      {open && (
        <div id="home-mobile-menu" className="border-t border-line-soft bg-[#080808] px-5 pb-6 pt-2 sm:px-8 lg:hidden">
          <nav aria-label="Homepage sections">
            <ul className="divide-y divide-line-soft">
              {HOME_SECTIONS.map(({ id, label }) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    onClick={() => setOpen(false)}
                    className={cn('block py-3 text-base font-medium', active === id ? 'text-gold-soft' : 'text-ink')}
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-4">
            <Actions stacked onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </header>
  )
}
