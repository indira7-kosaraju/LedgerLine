import axios from 'axios'
import { env } from '../config/env'

// One error shape for the whole app, whatever went wrong.
// The backend sends errors as { error: { code, message, details? } }.
export class ApiError extends Error {
  constructor({ status, code, message, details }) {
    super(message)
    this.name = 'ApiError'
    this.status = status // HTTP status, or 0 when the server couldn't be reached
    this.code = code // e.g. INSUFFICIENT_FUNDS, VALIDATION_ERROR, NETWORK_ERROR
    this.details = details // field-level validation messages, if any
  }
}

const FALLBACK_MESSAGES = {
  400: 'Some of the information you entered is not valid.',
  401: 'Please sign in to continue.',
  403: 'You do not have permission to do that.',
  404: 'We could not find what you were looking for.',
  409: 'This conflicts with existing data.',
  422: 'This request could not be completed.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'Something went wrong on our side. Please try again.',
}

function toApiError(error) {
  if (axios.isCancel(error)) {
    return new ApiError({ status: 0, code: 'CANCELED', message: 'Request was canceled' })
  }
  if (error.response) {
    const { status, data, headers } = error.response
    // Rate limited: tell the user how long to wait (Retry-After is in seconds).
    if (status === 429) {
      const seconds = Number.parseInt(headers?.['retry-after'], 10)
      const wait = Number.isFinite(seconds) ? `in ${seconds < 120 ? `${seconds} seconds` : `${Math.ceil(seconds / 60)} minutes`}` : 'in a moment'
      return new ApiError({ status, code: data?.error?.code ?? 'RATE_LIMITED', message: `Too many requests. Please try again ${wait}.` })
    }
    return new ApiError({
      status,
      code: data?.error?.code ?? `HTTP_${status}`,
      // Prefer the backend's message – it is written to be safe to show.
      message: data?.error?.message ?? FALLBACK_MESSAGES[status] ?? FALLBACK_MESSAGES[500],
      details: data?.error?.details,
    })
  }
  if (error.code === 'ECONNABORTED') {
    return new ApiError({ status: 0, code: 'TIMEOUT', message: 'The server took too long to respond.' })
  }
  return new ApiError({
    status: 0,
    code: 'NETWORK_ERROR',
    message: 'Cannot reach the LedgerLine server. Is the backend running?',
  })
}

// The single Axios instance every API service uses.
// The base URL comes from .env – it is never hard-coded.
export const api = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 15000,
  // Send the HttpOnly session cookie with every request. The token itself is
  // never visible to JavaScript – the browser attaches it automatically.
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    // Required by the backend's CSRF protection for cookie-authenticated writes.
    'X-Requested-With': 'XMLHttpRequest',
  },
})

// Lets the auth layer react when the session expires (any 401 from a protected call).
const unauthorizedListeners = new Set()
export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = toApiError(error)
    // Login (wrong password) and the initial session check also return 401 –
    // those calls set skipAuthRedirect so they don't count as "session expired".
    if (apiError.status === 401 && !error.config?.skipAuthRedirect) {
      unauthorizedListeners.forEach((listener) => listener(apiError))
    }
    return Promise.reject(apiError)
  },
)
