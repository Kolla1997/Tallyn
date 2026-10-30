// Names and avatar colours for household members (#39). Colours come from
// design-tokens.json (via CSS variables) and stay the same for a person.
// Colours that keep white letters readable in light and dark (#187).
const COLORS = ['var(--color-redesign-button)', 'var(--color-redesign-in)', 'var(--color-redesign-grey-5)', 'var(--color-redesign-accent)']

export function colorFor(userId) {
  let h = 0
  for (const ch of userId || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]
}

export function nameOf(member) {
  if (!member) return 'Someone'
  return member.display_name || `Your ${member.role}`
}

// The first whole character, so an emoji or accented name isn't cut in half (#154).
export function firstChar(text) {
  const t = (text || '').trim()
  if (!t) return ''
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const [first] = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t)
    return first.segment
  }
  return Array.from(t)[0]
}

export function initialOf(member) {
  return (firstChar(member?.display_name) || firstChar(member?.role) || '·').toUpperCase()
}

// Avatar is a coloured circle with the person's initial; decorative next to
// their name.
export function Avatar({ member, small = false }) {
  return (
    <span className={small ? 'avatar avatar-sm' : 'avatar'} style={{ background: colorFor(member?.user_id) }} aria-hidden="true">
      {initialOf(member)}
    </span>
  )
}
