import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { getHealth } from '../api/health.api'
import { useAuth } from '../hooks/useAuth'
import { buttonClasses } from '../components/ui/buttonStyles'
import { Card, CardBody, CardHeader } from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Button from '../components/ui/Button'
import Alert from '../components/ui/Alert'
import Spinner from '../components/ui/Spinner'

const FEATURES = [
  {
    title: 'Double-entry ledger',
    text: 'Every movement writes one debit and one credit. Balances can always be recomputed from the ledger.',
  },
  {
    title: 'Backend is the source of truth',
    text: 'The browser never approves money movement. Every rule is checked by the server inside a database transaction.',
  },
  {
    title: 'Role-based access',
    text: 'Account holders, administrators and auditors each see only what they are allowed to see.',
  },
  {
    title: 'Every attempt is audited',
    text: 'Successful and refused actions are recorded in an append-only audit log.',
  },
]

// Checks GET /api/health so you can see the frontend ↔ backend connection works.
function SystemStatus() {
  const [state, setState] = useState({ loading: true, data: null, error: null })
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

  return (
    <Card>
      <CardHeader
        title="System status"
        description="Live check of the LedgerLine API"
        action={
          <Button variant="secondary" size="sm" onClick={refresh} loading={loading}>
            Refresh
          </Button>
        }
      />
      <CardBody className="space-y-3">
        {loading && !data && !error ? (
          <p className="flex items-center gap-2 text-sm text-ink-3">
            <Spinner /> Checking…
          </p>
        ) : (
          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-ink-2">API server</dt>
              <dd>{apiOk ? <Badge tone="success" dot>Online</Badge> : <Badge tone="danger" dot>Offline</Badge>}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-ink-2">Database</dt>
              <dd>
                {dbOk ? <Badge tone="success" dot>Connected</Badge> : <Badge tone={apiOk ? 'danger' : 'neutral'} dot>{apiOk ? 'Unreachable' : 'Unknown'}</Badge>}
              </dd>
            </div>
            {data && (
              <div className="flex items-center justify-between">
                <dt className="text-ink-2">Last checked</dt>
                <dd className="tabular-nums text-ink">{new Date(data.timestamp).toLocaleTimeString()}</dd>
              </div>
            )}
          </dl>
        )}
        {error && <Alert tone="danger" title="Connection problem">{error.message}</Alert>}
      </CardBody>
    </Card>
  )
}

export default function HomePage() {
  const { status } = useAuth()

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <section>
          <p className="text-sm font-semibold uppercase tracking-wide text-gold-soft">Simulated banking</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Money movement with a ledger you can prove.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-ink-2">
            Open accounts, deposit simulated money, withdraw and transfer – with every rupee traceable to a
            balanced, append-only ledger.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {status === 'authenticated' ? (
              <Link to="/dashboard" className={buttonClasses('primary', 'lg')}>
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link to="/register" className={buttonClasses('primary', 'lg')}>
                  Create an account
                </Link>
                <Link to="/login" className={buttonClasses('secondary', 'lg')}>
                  Sign in
                </Link>
              </>
            )}
          </div>

          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <li key={f.title} className="rounded-xl border border-line bg-card p-4">
                <h3 className="text-sm font-semibold text-ink">{f.title}</h3>
                <p className="mt-1 text-sm leading-6 text-ink-2">{f.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <aside>
          <SystemStatus />
        </aside>
      </div>
    </div>
  )
}
