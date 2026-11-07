import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

// Keeps filters and the page number in the URL (?status=FROZEN&page=2), so
// refreshing the page or sharing the link keeps the same view.
export function useQueryParams(defaults = {}) {
  const [searchParams, setSearchParams] = useSearchParams()

  const get = (name) => searchParams.get(name) ?? defaults[name] ?? ''
  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1)

  // update({ status: 'FROZEN' }) – changing a filter resets to page 1.
  const update = useCallback(
    (changes) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (value === '' || value === null || value === undefined) next.delete(key)
          else next.set(key, String(value))
        }
        if (!('page' in changes)) next.delete('page')
        return next
      })
    },
    [setSearchParams],
  )

  return { get, page, update }
}
