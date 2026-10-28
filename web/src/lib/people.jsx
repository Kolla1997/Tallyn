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

export function initialOf(member) {
  const n = member?.display_name?.trim()
  return (n ? n.charAt(0) : member?.role?.charAt(0) || '·').toUpperCase()
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
