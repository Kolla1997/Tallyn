import { supabase } from './supabase.js'

// Calls the Go API with the signed-in user's access token (ADR 0003).
// Pass { method, body } for writes; body is sent as JSON.
export async function api(path, { method = 'GET', body } = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const headers = session ? { Authorization: `Bearer ${session.access_token}` } : {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}
