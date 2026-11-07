import { useEffect, useRef } from 'react'
import Button from './Button'

// Modal confirmation built on the native <dialog> element, which gives us
// focus trapping, Escape-to-close and a backdrop for free.
export default function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm', tone = 'primary', loading = false, onConfirm, onCancel }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-dialog-title"
      // Escape key: keep control in React (and don't allow closing mid-request).
      onCancel={(event) => {
        event.preventDefault()
        if (!loading) onCancel()
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="px-6 pb-4 pt-6">
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <div className="mt-3 text-sm text-slate-600">{children}</div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
        <Button variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button variant={tone} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}
