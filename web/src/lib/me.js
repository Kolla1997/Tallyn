import { api } from './api.js'

// Who you are (/api/me), started early (#159): the consent check and your
// profile load side by side instead of one after the other. The first
// caller takes the started request; later calls (after a change) load fresh.
let early = null

export function startMe() {
  early ??= api('/api/me')
  early.catch(() => {}) // handled by whoever takes it
}

export function loadMe() {
  const p = early ?? api('/api/me')
  early = null
  return p
}

export function forgetMe() {
  early = null
}
