// Reads build-time environment variables (from frontend/.env).
// Vite only exposes variables that start with VITE_, and they end up in the
// public JavaScript bundle – so this file must never contain secrets.

function required(name) {
  const value = import.meta.env[name]
  if (!value) {
    throw new Error(`Missing ${name}. Copy frontend/.env.example to frontend/.env and restart "npm run dev".`)
  }
  return value
}

export const env = Object.freeze({
  // Remove a trailing slash so "base + /path" never produces "//path".
  apiBaseUrl: required('VITE_API_BASE_URL').replace(/\/+$/, ''),
})
