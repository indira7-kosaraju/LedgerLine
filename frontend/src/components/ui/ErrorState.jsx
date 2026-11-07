import Alert from './Alert'
import Button from './Button'

const TITLES = {
  403: 'Access denied',
  404: 'Not found',
  0: 'Connection problem',
}

// Shown when loading data fails. 401 never reaches here – the auth layer redirects to sign-in.
export default function ErrorState({ error, onRetry, className }) {
  if (!error) return null
  const retryable = error.status === 0 || error.status >= 500 || error.status === 429
  return (
    <Alert tone="danger" title={TITLES[error.status] ?? 'Something went wrong'} className={className}>
      <p>{error.message}</p>
      {retryable && onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Alert>
  )
}
