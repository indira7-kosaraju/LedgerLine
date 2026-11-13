import { Link } from 'react-router'

export default function ForbiddenPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <p className="text-sm font-semibold text-danger">403</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">Access denied</h1>
      <p className="mt-2 text-ink-2">Your role does not have access to this page.</p>
      <Link to="/dashboard" className="mt-6 text-sm font-medium text-gold-soft hover:text-gold-bright">
        ← Back to your dashboard
      </Link>
    </div>
  )
}
