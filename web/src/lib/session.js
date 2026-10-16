// Sign in again after 12 hours, however active (#92, ADR 0012). The time of
// sign-in comes from the access token's amr list (its oldest entry: the
// password sign-in; a 2FA step-up adds a newer one). The Go API refuses older
// sessions too, so this is the friendly half: sign out cleanly, with a note.

import { supabase } from './supabase.js'

export const MAX_SESSION_MS = 12 * 60 * 60 * 1000

// Two ways to sign out (#92, tested in #116). The Sign out button ends the
// session everywhere (Supabase's default). Automatic sign-outs (30 minutes
// idle, #91; 12 hours, #92) end only this device's, so stepping away from
// the laptop doesn't sign out your phone.
export const signOutEverywhere = () => supabase.auth.signOut()
export const signOutHere = () => supabase.auth.signOut({ scope: 'local' })

// When this session signed in, in ms, or null if the token doesn't say.
export function signedInAt(accessToken) {
  try {
    const part = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const times = (JSON.parse(atob(part)).amr ?? []).map((a) => a.timestamp).filter((t) => t > 0)
    return times.length ? Math.min(...times) * 1000 : null
  } catch {
    return null
  }
}

// When this session last entered a 2FA code, in ms, or null (#23): backup
// codes are only made right after a code, like the API's step-up check.
export function totpAt(accessToken) {
  try {
    const part = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const times = (JSON.parse(atob(part)).amr ?? []).filter((a) => a.method === 'totp' || a.method === 'mfa/totp').map((a) => a.timestamp)
    return times.length ? Math.max(...times) * 1000 : null
  } catch {
    return null
  }
}

export function sessionOver(now, at) {
  return at != null && now - at >= MAX_SESSION_MS
}

// The sign-in page's note after an automatic sign-out, shown once.
const NOTE = 'tallyn.signOutNote'
export const NOTES = {
  idle: 'You were signed out after 30 minutes without activity, to keep your money private.', // #91
  max: 'For your security, Tallyn asks you to sign in again every 12 hours.', // #92
}

export function rememberSignOutNote(reason) {
  try {
    localStorage.setItem(NOTE, reason)
  } catch {
    // the note is a nicety
  }
}

export function takeSignOutNote() {
  try {
    const v = localStorage.getItem(NOTE)
    localStorage.removeItem(NOTE)
    return NOTES[v] ? v : ''
  } catch {
    return ''
  }
}
