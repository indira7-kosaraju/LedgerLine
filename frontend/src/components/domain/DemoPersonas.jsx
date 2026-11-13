import { useId, useState } from 'react'
import { DEMO_CREDENTIALS_URL, DEMO_PERSONAS } from '../../config/demoPersonas'
import { cn } from '../../utils/cn'

function ChevronIcon({ open }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('size-5 transition-transform', open && 'rotate-180')}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

// Opens by default on wide screens; collapsed on phones so the sign-in form stays close at hand.
const startOpen = () => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 1024px)').matches

// "Use account" only fills in the email (onSelect) – it never signs in and never knows a password.
export default function DemoPersonas({ onSelect, selectedEmail }) {
  const [open, setOpen] = useState(startOpen)
  const panelId = useId()

  return (
    <section className="mt-7 border-t border-line-soft pt-6" aria-labelledby={`${panelId}-title`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start justify-between gap-3 rounded-lg text-left"
      >
        <span>
          <span id={`${panelId}-title`} className="block text-base font-semibold text-ink">
            Evaluation &amp; Demo Personas
          </span>
          <span className="mt-0.5 block text-sm text-ink-2">Explore LedgerLine using the available demonstration accounts.</span>
        </span>
        <span className="mt-0.5 shrink-0 rounded-md border border-gold-deep/60 p-1 text-gold-soft">
          <ChevronIcon open={open} />
        </span>
      </button>

      {open && (
        <div id={panelId} className="mt-4">
          <ul className="grid gap-3 sm:grid-cols-2">
            {DEMO_PERSONAS.map((p) => {
              const selected = p.email && p.email === selectedEmail
              return (
                <li
                  key={p.id}
                  className={cn(
                    'flex flex-col rounded-xl border bg-[linear-gradient(160deg,#1a1815_0%,#121212_100%)] p-4 transition-colors',
                    selected ? 'border-gold-line' : 'border-line hover:border-gold-deep/70',
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink">{p.name}</h3>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[0.7rem] font-medium ring-1 ring-inset',
                        p.email ? 'bg-gold-dark/60 text-gold-soft ring-gold-deep/60' : 'bg-elevated text-ink-2 ring-line',
                      )}
                    >
                      {p.badge}
                    </span>
                  </div>
                  <p className="mt-2 flex-1 text-xs leading-5 text-ink-2">{p.description}</p>
                  {p.email ? (
                    <>
                      <p className="mt-2 truncate font-mono text-[0.7rem] text-ink-3" title={p.email}>
                        {p.email}
                      </p>
                      <button
                        type="button"
                        onClick={() => onSelect(p)}
                        aria-describedby={`${panelId}-${p.id}`}
                        className={cn(
                          'mt-3 inline-flex h-9 items-center justify-center rounded-lg text-sm font-semibold transition',
                          selected
                            ? 'gold-gradient text-on-gold'
                            : 'text-gold-soft ring-1 ring-inset ring-gold-deep hover:bg-gold-dark/50 hover:text-gold-bright hover:ring-gold-line',
                        )}
                      >
                        {selected ? 'Selected ✓' : 'Use account'}
                      </button>
                      <span id={`${panelId}-${p.id}`} className="sr-only">
                        Fills in the email for {p.name}; you then type the password.
                      </span>
                    </>
                  ) : (
                    <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-ink-3">
                      <LockIcon /> Private credentials – sign in manually
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="mt-4 rounded-lg border border-gold-deep/50 bg-gold-dark/30 px-3 py-2.5 text-xs leading-5 text-ink-2">
            Demo accounts use simulated money. Sign-in is subject to normal security checks. The shared demo password is published in the{' '}
            <a
              href={DEMO_CREDENTIALS_URL}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-gold-soft underline-offset-2 hover:text-gold-bright hover:underline"
            >
              project README
            </a>
            ; shared accounts can be changed by other visitors, so access is not guaranteed.
          </p>
        </div>
      )}
    </section>
  )
}
