import { supabase } from './supabase.js'

// Authenticators (#23): someone can have more than one (a phone and a password
// manager, say). A code comes from one of them, so it's checked against each
// verified authenticator until one accepts it.

export async function verifiedAuthenticators() {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return (data?.totp ?? []).filter((f) => f.status === 'verified')
}

// True if any of `factorIds` accepts the code. A wrong code is false, never
// an error: the caller says "That code didn't work".
export async function verifyCode(code, factorIds) {
  for (const factorId of factorIds) {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    if (!error) return true
  }
  return false
}
