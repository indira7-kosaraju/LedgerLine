import Spinner from './Spinner'

export default function FullPageSpinner({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center gap-3 text-sm text-slate-500">
      <Spinner className="size-5 text-brand-600" label={label} />
      {label}
    </div>
  )
}
