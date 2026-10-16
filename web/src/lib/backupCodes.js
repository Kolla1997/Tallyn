// Backup codes (#23): small flags kept for this tab (sessionStorage).
const RECOVERED = 'tallyn.recoveredWithCode' // just used a backup code: say so on the setup screen
const JUST_SET_UP = 'tallyn.just2FA' // just set up an authenticator: show a new set of codes
const LATER = 'tallyn.codesLater' // "Remind me next time" for this sign-in

let memory = {}
function read(key) {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return memory[key] ?? null
  }
}
function write(key, value) {
  try {
    if (value == null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch {
    memory = { ...memory, [key]: value }
  }
}

export const markRecovered = () => write(RECOVERED, '1')
export function takeRecovered() {
  const v = read(RECOVERED) === '1'
  write(RECOVERED, null)
  return v
}
export const markJustSetUp = () => write(JUST_SET_UP, '1')
export const justSetUp = () => read(JUST_SET_UP) === '1'
export const clearJustSetUp = () => write(JUST_SET_UP, null)
export const remindLater = () => write(LATER, '1')
export const remindedLater = () => read(LATER) === '1'

// The codes as a text file to keep.
export function codesFile(codes, email) {
  return [
    'Tallyn backup codes',
    email ? `For ${email}` : null,
    `Made ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
    '',
    "Each code works once, if you can't use your authenticator app.",
    '',
    ...codes.map((c, i) => `${String(i + 1).padStart(2, ' ')}. ${c}`),
    '',
  ]
    .filter((l) => l != null)
    .join('\n')
}
