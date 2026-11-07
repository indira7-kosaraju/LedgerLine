// Removes empty filters so the URL stays clean: { status: '', page: 2 } → { page: 2 }
export function cleanParams(params = {}) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))
}
