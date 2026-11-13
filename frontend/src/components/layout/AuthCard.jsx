import Logo from '../Logo'

// Centered card used by the sign-in and registration pages: large gold brand mark, then the form card.
export default function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="auth-glow relative min-h-[calc(100vh-10rem)]">
      <div className="mx-auto flex max-w-md flex-col px-4 py-10 sm:py-14">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size="lg" />
          <p className="mt-3 text-sm tracking-wide text-ink-2">Secure · Transparent · Tamper-evident banking</p>
        </div>
        <div className="surface-gradient rounded-2xl border border-line px-6 py-8 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.95)] ring-1 ring-inset ring-gold-deep/20 sm:px-8">
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-ink-2">{subtitle}</p>}
          </div>
          <div className="mt-7">{children}</div>
          {footer && <p className="mt-6 text-center text-sm text-ink-2">{footer}</p>}
        </div>
      </div>
    </div>
  )
}
