// Fresh test people for each test (#113), in the Supabase project just for
// tests. Each gets a confirmed email, a password and 2FA, has accepted the
// current Terms and Privacy Policy and has backup codes, so the browser lands
// in the app after the 2FA code. The authenticator secret only lives in memory.
// Obviously fake details only (CLAUDE.md §7).
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { freshCode } from './totp.js'

const URL = process.env.E2E_SUPABASE_URL
const RUN = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`
let n = 0

// A random sign-in value for a test person, made fresh every run.
const oneTimeLogin = () => randomBytes(18).toString('base64url')

// The secret key only ever runs here, in the test runner. Never in web/src.
const admin = () => createClient(URL, process.env.E2E_SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

export const API = `http://localhost:8090`

export async function call(token, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`)
  return text ? JSON.parse(text) : null
}

// A signed-in, 2FA-verified person. Pass `household` to have them create one.
export async function createPerson({ name, household } = {}) {
  n += 1
  const email = `e2e-${RUN}-${n}@example.test`
  const password = oneTimeLogin() // random each run, never stored
  const { data: made, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(`create test user: ${error.message}`)

  const client = createClient(URL, process.env.E2E_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const signIn = await client.auth.signInWithPassword({ email, password })
  if (signIn.error) throw new Error(`sign in test user: ${signIn.error.message}`)
  const enrol = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'e2e' })
  if (enrol.error) throw new Error(`enrol 2FA: ${enrol.error.message}`)
  const secret = enrol.data.totp.secret
  const verified = await client.auth.mfa.challengeAndVerify({ factorId: enrol.data.id, code: await freshCode(secret) })
  if (verified.error) throw new Error(`verify 2FA: ${verified.error.message}`)
  const token = verified.data.access_token

  const person = { id: made.user.id, email, password, secret, token, name }
  const { versions } = await call(token, '/api/consent')
  await call(token, '/api/consent', { method: 'POST', body: { terms: versions.terms, privacy: versions.privacy } })
  await call(token, '/api/backup-codes', { method: 'POST' }) // or the app asks to save them first
  if (name) await call(token, '/api/me', { method: 'PUT', body: { display_name: name } })
  if (household) {
    const h = await call(token, '/api/households', { method: 'POST', body: { name: household, home_currency: 'USD' } })
    person.householdId = h.id
  }
  return person
}

// Removes a test person: unlinks their banks first (so Plaid sandbox items are
// removed too), then deletes the user, which cascades to their rows. Households
// they made stay behind, empty. Only people made in this run are passed here.
export async function removePerson(person) {
  try {
    const me = await call(person.token, '/api/me')
    for (const h of me.households ?? []) {
      const { banks } = await call(person.token, `/api/banks?household_id=${h.id}`)
      for (const b of banks ?? []) {
        if (b.owner_user_id === person.id) await call(person.token, `/api/banks/${b.id}`, { method: 'DELETE' }).catch(() => {})
      }
    }
  } catch {
    // token expired or nothing linked: deleting the user still cleans up
  }
  const { error } = await admin().auth.admin.deleteUser(person.id)
  if (error) console.warn(`could not delete test user ${person.email}: ${error.message}`)
}
