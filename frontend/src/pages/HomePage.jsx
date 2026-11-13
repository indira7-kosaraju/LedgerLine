import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { getHealth } from '../api/health.api'
import { useAuth } from '../hooks/useAuth'
import { buttonClasses } from '../components/ui/buttonStyles'
import Badge from '../components/ui/Badge'
import Alert from '../components/ui/Alert'
import Spinner from '../components/ui/Spinner'
import HomeHeader from '../components/home/HomeHeader'
import BankIllustration from '../components/home/BankIllustration'
import VerificationCard from '../components/home/VerificationCard'
import GoldWaves from '../components/home/GoldWaves'
import {
  ArrowRightIcon,
  BoltIcon,
  ClipboardIcon,
  ClockIcon,
  CoinsIcon,
  DatabaseIcon,
  InfoIcon,
  LayersIcon,
  PeopleIcon,
  PulseIcon,
  RefreshIcon,
  ServerIcon,
  ShieldTickIcon,
} from '../components/home/homeIcons'
import { cn } from '../utils/cn'

const FEATURES = [
  {
    title: 'Double-entry ledger',
    text: 'Every movement writes one debit and one credit. Balances stay consistent.',
    icon: CoinsIcon,
  },
  {
    title: 'Trusted backend',
    text: 'The browser never approves money movement. Every rule is enforced in the database.',
    icon: ShieldTickIcon,
  },
  {
    title: 'Role-based access',
    text: 'Account holders, administrators and auditors each see only what they are allowed to see.',
    icon: PeopleIcon,
  },
  {
    title: 'Every attempt is audited',
    text: 'Successful and refused actions are recorded in an append-only audit log.',
    icon: ClipboardIcon,
  },
]

const HIGHLIGHTS = [
  { title: '3 Roles', text: 'Customer, Admin, Auditor', icon: PeopleIcon },
  {
    title: 'Append-only',
    text: 'Tamper-evident audit trail',
    icon: LayersIcon,
  },
  {
    title: 'Real-time',
    text: 'Balance and transaction checks',
    icon: BoltIcon,
  },
  {
    title: 'Secure',
    text: 'Rate limits, lockout & strict access',
    icon: ShieldTickIcon,
  },
]

const STEPS = [
  {
    title: 'Create an account',
    text: 'Register, complete a short onboarding with made-up details, and open up to five accounts.',
  },
  {
    title: 'Move simulated money',
    text: 'Deposit, withdraw and transfer. Each movement is one database transaction – a retry or double-click never sends money twice.',
  },
  {
    title: 'Prove every rupee',
    text: 'Auditors recompute every balance from the ledger and re-check the audit trail’s hash chain at any time.',
  },
]

// Live check of GET /api/health (existing endpoint) – nothing here is hardcoded: "Online"/"Connected" only
// appear when the API actually answers.
function SystemStatus() {
  const [state, setState] = useState({
    loading: true,
    data: null,
    error: null,
  })
  // Changing this number re-runs the effect below (used by the Refresh button).
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    // AbortController cancels the request if the component unmounts
    // (React's StrictMode mounts components twice in development).
    const controller = new AbortController()
    getHealth({ signal: controller.signal })
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => {
        if (error.code === 'CANCELED') return // component unmounted – ignore
        setState({ loading: false, data: null, error })
      })
    return () => controller.abort()
  }, [refreshKey])

  const refresh = () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    setRefreshKey((k) => k + 1)
  }

  const { loading, data, error } = state
  const apiOk = Boolean(data)
  const dbOk = data?.database === 'ok'
  const checking = loading && !data && !error

  const rows = [
    {
      label: 'API server',
      icon: ServerIcon,
      value: checking ? (
        <Badge dot>Checking…</Badge>
      ) : apiOk ? (
        <Badge tone="success" dot>
          Online
        </Badge>
      ) : (
        <Badge tone="danger" dot>
          Offline
        </Badge>
      ),
    },
    {
      label: 'Database',
      icon: DatabaseIcon,
      value: checking ? (
        <Badge dot>Checking…</Badge>
      ) : dbOk ? (
        <Badge tone="success" dot>
          Connected
        </Badge>
      ) : (
        <Badge tone={apiOk ? 'danger' : 'neutral'} dot>
          {apiOk ? 'Unreachable' : 'Unknown'}
        </Badge>
      ),
    },
    {
      label: 'Last checked',
      icon: ClockIcon,
      value: data ? (
        <span className="text-base font-semibold tabular-nums text-ink">{new Date(data.timestamp).toLocaleTimeString()}</span>
      ) : (
        <span className="text-ink-3">—</span>
      ),
    },
  ]

  return (
    <section
      aria-labelledby="system-status-title"
      className="rounded-2xl border border-gold-line/80 bg-[linear-gradient(160deg,#211b11_0%,#141210_60%,#0e0d0b_100%)] shadow-[0_0_44px_-14px_rgb(212_166_58/0.5)]"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
        <div className="flex items-center gap-3">
          <PulseIcon className="size-8 shrink-0 text-gold-soft" />
          <div>
            <h2 id="system-status-title" className="text-lg font-semibold text-ink">
              System status
            </h2>
            <p className="text-xs text-ink-2">Live check of the LedgerLine API</p>
          </div>
        </div>
        <button type="button" onClick={refresh} disabled={loading} className={buttonClasses('secondary', 'sm', 'h-9 text-ink hover:text-ink')}>
          {loading ? <Spinner /> : <RefreshIcon className="size-4" />}
          Refresh
        </button>
      </div>
      <dl className="divide-y divide-line-soft px-5 py-1">
        {rows.map(({ label, icon: Icon, value }) => (
          <div key={label} className="flex items-center justify-between gap-3 py-3">
            <dt className="flex items-center gap-3 text-sm font-medium text-ink">
              <Icon className="size-6 text-gold-soft" />
              {label}
            </dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {error && (
        <div className="px-5 pb-4">
          <Alert tone="danger" title="Connection problem">
            {error.message}
          </Alert>
        </div>
      )}
    </section>
  )
}

function FeatureCard({ title, text, icon: Icon }) {
  return (
    <li className="rounded-2xl border border-line bg-[linear-gradient(160deg,#1d1a14_0%,#141311_100%)] px-[1.15rem] py-5 shadow-[0_20px_40px_-28px_rgb(0_0_0/0.95)] transition-colors hover:border-gold-deep">
      <Icon className="size-11 text-gold-soft" />
      <h3 className="mt-4 text-[1.06rem] font-semibold tracking-tight text-ink">{title}</h3>
      <p className="mt-2 text-[0.92rem] leading-6 text-ink-2">{text}</p>
    </li>
  )
}

export default function HomePage() {
  const { status } = useAuth()
  const signedIn = status === 'authenticated'

  return (
    <div className="relative overflow-x-clip bg-[#090a0b]">
      <HomeHeader />

      <div
        role="note"
        className="flex items-center justify-center gap-2 border-b border-gold-deep/50 bg-gold-dark/50 px-4 py-2.5 text-center text-sm font-medium text-gold-bright"
      >
        <InfoIcon className="size-5 shrink-0 text-gold-soft" />
        Simulated money only – no real bank is connected.
      </div>

      {/* Hero */}
      <section id="top" aria-labelledby="hero-title" className="relative scroll-mt-24">
        {/* background lighting and waves (behind everything, not clickable) */}
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(45%_60%_at_78%_40%,rgb(212_166_58/0.16),transparent_70%)]"
          aria-hidden="true"
        />
        <GoldWaves className="absolute inset-x-0 bottom-[-4rem] h-64 w-full opacity-80 sm:h-80" />

        <div className="relative mx-auto grid max-w-[1560px] items-center gap-6 px-5 pb-8 pt-8 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:px-12 lg:pb-4 lg:pt-6 xl:px-14">
          <div className="relative z-10 lg:pl-6">
            <p className="text-sm font-semibold uppercase tracking-wide text-gold-soft">Simulated banking platform</p>
            <h1 id="hero-title" className="mt-3 text-4xl font-bold leading-[1.08] tracking-tight text-ink sm:text-5xl xl:text-[3.6rem]">
              Money movement with a ledger you can{' '}
              <span className="bg-gradient-to-br from-gold-bright via-gold-soft to-gold bg-clip-text text-transparent">prove.</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-ink-2">
              Open accounts, deposit simulated money, withdraw and transfer – with every rupee traceable to a balanced, append-only ledger.
            </p>
            <div className="mt-7 flex flex-wrap gap-4">
              {signedIn ? (
                <Link to="/dashboard" className={buttonClasses('primary', 'lg', 'h-14 px-8 text-lg')}>
                  Go to dashboard <ArrowRightIcon className="size-5" />
                </Link>
              ) : (
                <>
                  <Link to="/register" className={buttonClasses('primary', 'lg', 'h-14 px-8 text-lg')}>
                    Create an account <ArrowRightIcon className="size-5" />
                  </Link>
                  <Link to="/login" className={buttonClasses('secondary', 'lg', 'h-14 bg-[#090a0b]/80 px-11 text-lg')}>
                    Sign in
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[640px] lg:max-w-none">
            <BankIllustration className="relative ml-auto block w-[88%] drop-shadow-[0_30px_40px_rgb(0_0_0/0.7)] sm:w-[80%] lg:-mt-4 lg:w-[76%] xl:w-[74%]" />
            <VerificationCard className="absolute left-0 top-[24%] w-[46%] max-w-[230px] sm:left-[2%] lg:left-[10%] lg:top-[22%]" />
          </div>
        </div>
      </section>

      {/* Features + live system status */}
      <section id="features" aria-labelledby="features-title" className="relative scroll-mt-24">
        <h2 id="features-title" className="sr-only">
          Features
        </h2>
        <div className="mx-auto grid max-w-[1560px] gap-5 px-5 sm:px-8 lg:px-12 xl:grid-cols-[4fr_1.95fr] xl:px-14">
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <FeatureCard key={f.title} {...f} />
            ))}
          </ul>
          <SystemStatus />
        </div>
      </section>

      {/* Security highlights strip */}
      <section id="security" aria-labelledby="security-title" className="relative scroll-mt-24 pt-8">
        <GoldWaves className="absolute inset-x-0 -bottom-24 h-48 w-full opacity-50" />
        <h2 id="security-title" className="sr-only">
          Security
        </h2>
        <div className="relative mx-auto max-w-[1560px] px-5 sm:px-8 lg:px-12 xl:px-14">
          <ul className="grid gap-y-5 rounded-2xl border border-line bg-[linear-gradient(180deg,#151411,#0f0e0c)] px-6 py-5 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-line">
            {HIGHLIGHTS.map(({ title, text, icon: Icon }, i) => (
              <li key={title} className={cn('flex items-center gap-4', i > 0 && 'lg:pl-8')}>
                <Icon className="size-11 shrink-0 text-gold-soft" />
                <div>
                  <p className="text-lg font-semibold text-ink">{title}</p>
                  <p className="text-sm text-ink-2">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" aria-labelledby="how-title" className="relative scroll-mt-24 pt-20">
        <div className="mx-auto max-w-[1560px] px-5 sm:px-8 lg:px-12 xl:px-14">
          <p className="text-sm font-semibold uppercase tracking-wide text-gold-soft">How it works</p>
          <h2 id="how-title" className="mt-2 text-3xl font-bold tracking-tight text-ink">
            Three steps from sign-up to proof
          </h2>
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-line bg-[linear-gradient(160deg,#1d1a14_0%,#141311_100%)] p-6">
                <span className="gold-gradient flex size-10 items-center justify-center rounded-full text-lg font-bold text-on-gold">{i + 1}</span>
                <h3 className="mt-4 text-lg font-semibold text-ink">{s.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-2">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* About */}
      <section id="about" aria-labelledby="about-title" className="relative scroll-mt-24 pb-28 pt-16">
        <GoldWaves flip className="absolute inset-x-0 bottom-0 h-56 w-full opacity-70" />
        <div className="relative mx-auto max-w-[1560px] px-5 sm:px-8 lg:px-12 xl:px-14">
          <div className="flex flex-col gap-6 rounded-2xl border border-gold-deep/60 bg-[linear-gradient(160deg,#211b11_0%,#121110_100%)] p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-wide text-gold-soft">About</p>
              <h2 id="about-title" className="mt-2 text-2xl font-bold tracking-tight text-ink">
                A learning project with real engineering
              </h2>
              <p className="mt-3 text-sm leading-6 text-ink-2">
                LedgerLine is a demonstration banking app. It moves simulated money only and is not connected to any bank – but its ledger,
                idempotency, concurrency control, database roles and tamper-evident audit trail are built and tested as if it were.
              </p>
            </div>
            {!signedIn && (
              <Link to="/register" className={buttonClasses('primary', 'lg', 'shrink-0')}>
                Try it now <ArrowRightIcon className="size-5" />
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
