import { Link } from 'react-router'
import Logo from '../Logo'
import BankIllustration from '../home/BankIllustration'
import GoldWaves from '../home/GoldWaves'
import { CoinsIcon, InfoIcon, LayersIcon, PeopleIcon } from '../home/homeIcons'

const HIGHLIGHTS = [
  { label: 'Double-entry Accounting', icon: CoinsIcon },
  { label: 'Tamper-Evident Audit Trail', icon: LayersIcon },
  { label: 'Role-Based Access', icon: PeopleIcon },
]

function SimulatedNotice({ className }) {
  return (
    <p
      role="note"
      className={`flex items-center gap-2.5 rounded-xl border border-gold-line/70 bg-gold-dark/40 px-4 py-3 text-sm font-medium text-gold-bright ${className ?? ''}`}
    >
      <InfoIcon className="size-5 shrink-0 text-gold-soft" />
      Simulated money only — no real bank is connected.
    </p>
  )
}

// Left: premium branding panel (desktop). Phones get a compact header instead, so the form stays within reach.
function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden border-r border-line-soft bg-[radial-gradient(70%_50%_at_50%_22%,rgb(212_166_58/0.16),transparent_70%),linear-gradient(160deg,#121212_0%,#0b0b0a_55%,#090a0b_100%)] lg:flex lg:flex-col">
      <GoldWaves className="absolute inset-x-0 bottom-0 h-56 w-full opacity-70" />
      <GoldWaves flip className="absolute inset-x-0 top-[12%] h-40 w-full opacity-25" />
      <div className="relative flex flex-1 flex-col px-10 py-8 xl:px-16">
        <Link to="/" className="self-start text-sm font-medium text-ink-2 hover:text-gold-soft">
          ← Back to home
        </Link>
        <div className="mx-auto mt-2 w-full max-w-xl text-center">
          <BankIllustration className="mx-auto w-[78%] max-w-[420px] drop-shadow-[0_30px_40px_rgb(0_0_0/0.7)]" />
          <Logo className="mt-1 [&>span]:text-4xl [&>svg]:size-12" />
          <p className="mt-3 text-sm tracking-wide text-ink-2">Secure · Transparent · Tamper-Evident Banking</p>
        </div>
        <div className="mx-auto mt-8 w-full max-w-xl">
          <p className="text-3xl font-bold leading-tight tracking-tight text-ink xl:text-[2.4rem]">
            Your money. Every movement{' '}
            <span className="bg-gradient-to-br from-gold-bright via-gold-soft to-gold bg-clip-text text-transparent">accounted for.</span>
          </p>
          <p className="mt-4 text-base leading-7 text-ink-2">
            A simulated-money banking platform with a verifiable double-entry ledger, role-based access and a complete audit trail for every action.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            {HIGHLIGHTS.map(({ label, icon: Icon }) => (
              <li key={label} className="flex items-center gap-3 rounded-xl border border-line bg-card/70 px-3 py-3 text-sm font-medium text-ink">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-gold-deep/60 bg-gold-dark/50 text-gold-soft">
                  <Icon className="size-5" />
                </span>
                {label}
              </li>
            ))}
          </ul>
          <SimulatedNotice className="mt-8" />
        </div>
      </div>
    </aside>
  )
}

// Shared by the sign-in and registration pages: branding panel + dark, gold-bordered form card.
export default function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.08fr_1fr]">
      <BrandPanel />

      <div className="auth-glow relative flex flex-col px-4 py-6 sm:px-8 lg:justify-center lg:py-10">
        {/* compact branding for phones and tablets */}
        <div className="mb-6 lg:hidden">
          <div className="flex items-center justify-between gap-4">
            <Link to="/" aria-label="LedgerLine home">
              <Logo />
            </Link>
            <Link to="/" className="text-sm font-medium text-ink-2 hover:text-gold-soft">
              ← Home
            </Link>
          </div>
          <SimulatedNotice className="mt-4 text-xs" />
        </div>

        <div className="mx-auto w-full max-w-xl rounded-2xl border border-gold-line/60 bg-[linear-gradient(160deg,#1a1815_0%,#121212_45%,#0e0e0d_100%)] px-5 py-7 shadow-[0_30px_70px_-30px_rgb(0_0_0/0.95),0_0_50px_-20px_rgb(212_166_58/0.35)] sm:px-9 sm:py-9">
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-ink-2">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          {footer && <div className="mt-6">{footer}</div>}
        </div>
      </div>
    </div>
  )
}
