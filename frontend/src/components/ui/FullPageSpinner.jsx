import Spinner from './Spinner'

export default function FullPageSpinner({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-3 text-sm text-ink-3">
      <Spinner className="size-5 text-gold" label={label} />
      {label}
    </div>
  )
}
