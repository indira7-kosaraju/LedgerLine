import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="text-sm font-semibold text-gold-soft">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">Page not found</h1>
      <p className="mt-2 text-ink-2">The page you are looking for doesn&apos;t exist.</p>
      <Link to="/" className="mt-6 text-sm font-medium text-gold-soft hover:text-gold-bright">
        ← Back to home
      </Link>
    </div>
  )
}
