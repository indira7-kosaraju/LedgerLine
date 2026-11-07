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
    const { status, data } = error.response
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
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(toApiError(error)),
)
