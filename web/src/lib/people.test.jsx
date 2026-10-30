import { describe, expect, it } from 'vitest'
import { firstChar, initialOf } from './people.jsx'

// Initials take a whole character, so emoji and accented names aren't cut in half (#154).
describe('initialOf', () => {
  it('keeps emoji and combined characters whole', () => {
    expect(initialOf({ display_name: '👩‍👧 Mum' })).toBe('👩‍👧')
    expect(initialOf({ display_name: '  éva' })).toBe('É')
    expect(firstChar('🇬🇧 Sam')).toBe('🇬🇧')
  })
  it('falls back to the role, then a dot', () => {
    expect(initialOf({ display_name: '   ', role: 'teen' })).toBe('T')
    expect(initialOf(null)).toBe('·')
  })
})
