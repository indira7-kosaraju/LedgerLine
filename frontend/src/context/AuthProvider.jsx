import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AuthContext } from './AuthContext'
import * as authApi from '../api/auth.api'
import { onUnauthorized } from '../api/client'
import { useToast } from '../hooks/useToast'

// Holds "who is signed in" for the whole app.
//
// status: 'loading'       – still asking the backend (first page load)
//         'authenticated' – user is signed in, `user` is set
//         'anonymous'     – not signed in
//
// The JWT lives in an HttpOnly cookie that JavaScript cannot read, so the only way
// to know if we're signed in is to ask the backend: GET /api/auth/me.
// The `user` object here is for DISPLAY and navigation only – the backend
// re-checks identity and role on every request.
export default function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null })
  const toast = useToast()

  // Restore the session on page load / refresh.
  useEffect(() => {
    const controller = new AbortController()
    authApi
      .getCurrentUser({ signal: controller.signal })
      .then((user) => setState({ status: 'authenticated', user }))
      .catch((error) => {
        if (error.code === 'CANCELED') return
        setState({ status: 'anonymous', user: null })
      })
    return () => controller.abort()
  }, [])

  // Any 401 from a protected API call means the session expired or was revoked
  // (e.g. an admin deactivated the user). Sign out locally; routes redirect to /login.
  // (A ref, not state, so the listener always sees the latest status without re-subscribing.)
  const statusRef = useRef(state.status)
  useEffect(() => {
    statusRef.current = state.status
  }, [state.status])

  useEffect(
    () =>
      onUnauthorized(() => {
        // Several requests can fail with 401 at the same moment (a page loads 3 things at once).
        // Update the ref right away so only the FIRST one shows the toast – React state
        // would not change until after all of them have run.
        if (statusRef.current === 'authenticated') {
          statusRef.current = 'anonymous'
          toast.info('Your session has expired. Please sign in again.')
        }
        setState({ status: 'anonymous', user: null })
      }),
    [toast],
  )

  const login = useCallback(async (credentials) => {
    const user = await authApi.login(credentials)
    setState({ status: 'authenticated', user })
    return user
  }, [])

  const register = useCallback(async (details) => {
    const user = await authApi.register(details)
    setState({ status: 'authenticated', user })
    return user
  }, [])

  // After onboarding (or anything else that changes the user on the server), show the new state.
  const updateUser = useCallback((user) => setState({ status: 'authenticated', user }), [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      // Even if the request fails, forget the user locally.
      setState({ status: 'anonymous', user: null })
    }
  }, [])

  const value = useMemo(() => ({ ...state, login, register, logout, updateUser }), [state, login, register, logout, updateUser])

  return <AuthContext value={value}>{children}</AuthContext>
}
