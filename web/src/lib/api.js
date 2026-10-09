import { supabase } from './supabase.js'

// Calls the Go API with the signed-in user's access token (ADR 0003).
export async function api(path) {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const res = await fetch(path, {
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}
