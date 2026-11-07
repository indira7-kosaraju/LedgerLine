import { api } from './client'

// GET /api/health → { status, database, uptimeSeconds, timestamp }
export async function getHealth({ signal } = {}) {
  const { data } = await api.get('/health', { signal })
  return data
}
