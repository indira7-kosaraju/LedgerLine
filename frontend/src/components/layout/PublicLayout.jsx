import { Link, Outlet } from 'react-router'
import Logo from '../Logo'

// Layout for pages that don't need a login (home, sign in, register, 404).
// <Outlet /> is where React Router renders the matched child page.
export default function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="LedgerLine home">
            <Logo />
          </Link>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
            Simulated money only
          </span>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-sm text-slate-500 sm:px-6">
          LedgerLine is a learning project. No real bank is connected and no real money moves.
        </div>
      </footer>
    </div>
  )
}
