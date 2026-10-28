// Calm words for Supabase sign-in errors (#152), never Supabase's own text.
// Matched on error codes, which are stable, not on the message. The raw
// error still goes to the console for debugging.

export const UNREACHABLE = "We couldn't reach Tallyn just now. Check your connection and try again."
export const SOMETHING_WRONG = 'Something went wrong. Try again in a moment.'

const BY_CODE = {
  invalid_credentials: "That email and password don't match. Check them and try again.",
  email_not_confirmed: 'Confirm your email first: open the link we sent you, then sign in.',
  over_request_rate_limit: 'Too many tries. Wait a few minutes, then try again.',
  over_email_send_rate_limit: 'Too many tries. Wait a few minutes, then try again.',
  weak_password: 'Choose a longer or less common password.',
}

// Sign-up for an email that already has an account. Only reachable if
// Confirm email is ever turned off; the caller then shows the same "We sent
// a link" screen as a new sign-up, so nothing reveals the account.
export const isExistingAccount = (error) => error?.code === 'user_already_exists' || error?.code === 'email_exists'

export function authMessage(error) {
  if (!error) return ''
  console.error(error)
  if (error.name === 'AuthRetryableFetchError' || error instanceof TypeError) return UNREACHABLE
  if (BY_CODE[error.code]) return BY_CODE[error.code]
  if (error.status === 429) return BY_CODE.over_request_rate_limit
  return SOMETHING_WRONG
}
