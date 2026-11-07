import { useCallback, useMemo, useRef, useState } from 'react'
import { ToastContext } from './ToastContext'
import { cn } from '../utils/cn'

const TONES = {
  success: 'border-emerald-200 bg-white text-emerald-800 [&>span]:bg-emerald-500',
  error: 'border-rose-200 bg-white text-rose-800 [&>span]:bg-rose-500',
  info: 'border-brand-200 bg-white text-brand-800 [&>span]:bg-brand-500',
}

const DURATION_MS = 4500

// Small notifications in the corner: toast.success('Saved'), toast.error('Failed').
export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const nextId = useRef(0)

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const show = useCallback(
    (tone, message) => {
      const id = ++nextId.current
      setToasts((list) => [...list.slice(-3), { id, tone, message }]) // keep at most 4 on screen
      setTimeout(() => dismiss(id), DURATION_MS)
    },
    [dismiss],
  )

  const toast = useMemo(
    () => ({
      success: (message) => show('success', message),
      error: (message) => show('error', message),
      info: (message) => show('info', message),
    }),
    [show],
  )

  return (
    <ToastContext value={toast}>
      {children}
      {/* aria-live makes screen readers announce new toasts */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn('pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg', TONES[t.tone])}
          >
            <span className="mt-1.5 size-2 shrink-0 rounded-full" aria-hidden="true" />
            <p className="flex-1 text-slate-800">{t.message}</p>
            <button type="button" onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-600" aria-label="Dismiss notification">
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  )
}
