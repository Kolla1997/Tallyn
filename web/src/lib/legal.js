import privacyText from '../../../legal/privacy.md?raw'
import termsText from '../../../legal/terms.md?raw'

// The Terms of Service and Privacy Policy (#36), straight from legal/*.md so
// the pages and what people agree to are the same text. The versions here are
// what the API checks (internal/api/consent.go).

function parse(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/)
  const meta = {}
  for (const line of (m?.[1] ?? '').split('\n')) {
    const kv = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/)
    if (kv) meta[kv[1]] = kv[2]
  }
  return { version: meta.version, effective: meta.effective, body: m ? text.slice(m[0].length) : text }
}

export const LEGAL = {
  terms: { title: 'Terms of Service', path: '/terms', ...parse(termsText) },
  privacy: { title: 'Privacy Policy', path: '/privacy', ...parse(privacyText) },
}

export const currentVersions = () => ({ terms: LEGAL.terms.version, privacy: LEGAL.privacy.version })

// Remembered when someone ticks "I agree" at sign-up, so their first sign-in
// can record it without asking twice.
const PENDING = 'tallyn.agreed'
export function rememberAgreement() {
  try {
    localStorage.setItem(PENDING, JSON.stringify(currentVersions()))
  } catch {
    // they'll be asked again after sign-in
  }
}
export function takeAgreement() {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING) ?? 'null')
    localStorage.removeItem(PENDING)
    return v
  } catch {
    return null
  }
}
