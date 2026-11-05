// Product news (#281): the box at sign-up starts ticked, except for browsers
// in Europe, where the EU and UK need a real opt-in. The time zone is the
// only hint we have before an account exists; it is never sent anywhere.
export function newsDefault() {
  try {
    return !Intl.DateTimeFormat().resolvedOptions().timeZone?.startsWith('Europe/')
  } catch {
    return false
  }
}

export const NEWS_LABEL = 'Send me product news'
export const NEWS_NOTE = 'New features and tips, about once a month. Stop any time.'
