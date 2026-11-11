import { api } from './client'

// The backend sets/clears the HttpOnly session cookie. These functions
// only ever receive the user object – never the token.

export async function login({ email, password }) {
  const { data } = await api.post('/auth/login', { email, password }, { skipAuthRedirect: true })
  return data.user
}

export async function register({ email, password, fullName }) {
  const { data } = await api.post('/auth/register', { email, password, fullName }, { skipAuthRedirect: true })
  return data.user
}

// Needs the current password. The backend ends every other session and replaces this
// browser's session cookie, so we stay signed in here.
export async function changePassword({ currentPassword, newPassword }) {
  const { data } = await api.post('/auth/change-password', { currentPassword, newPassword })
  return data.user
}

export async function logout() {
  await api.post('/auth/logout', undefined, { skipAuthRedirect: true })
}

// Used on page load to find out whether a valid session cookie exists.
export async function getCurrentUser({ signal } = {}) {
  const { data } = await api.get('/auth/me', { signal, skipAuthRedirect: true })
  return data.user
}
