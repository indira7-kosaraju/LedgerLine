import { useCallback, useEffect, useRef, useState } from 'react'

// Loads data from the API and tracks loading / error state.
//
//   const accounts = useApi((opts) => listAccounts({ page }, opts), [page])
//   accounts.data / accounts.error / accounts.loading / accounts.reload()
//
// `deps` must be simple values (strings, numbers). When they change, the request
// runs again; the previous data stays on screen while the new data loads.
// Requests are canceled when the component unmounts or deps change.
export function useApi(fetcher, deps = []) {
  const [reloadCount, setReloadCount] = useState(0)
  const key = JSON.stringify([...deps, reloadCount])
  const [state, setState] = useState({ key: null, data: undefined, error: null })

  // `fetcher` is a new function on every render. Keep the latest one in a ref so the
  // request below re-runs only when `key` changes, not on every render.
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    const controller = new AbortController()
    fetcherRef.current({ signal: controller.signal })
      .then((data) => setState({ key, data, error: null }))
      .catch((error) => {
        if (error.code !== 'CANCELED') setState({ key, data: undefined, error })
      })
    return () => controller.abort()
  }, [key])

  const reload = useCallback(() => setReloadCount((c) => c + 1), [])

  return {
    data: state.data,
    error: state.key === key ? state.error : null,
    loading: state.key !== key,
    reload,
  }
}
