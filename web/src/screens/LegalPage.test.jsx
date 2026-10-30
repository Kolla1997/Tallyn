import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import LegalPage from './LegalPage.jsx'
import { slug } from '../components/Markdown.jsx'

// #1: the legal pages have a contents list; every entry links to its section's heading.
describe('LegalPage', () => {
  it.each(['terms', 'privacy'])('lists %s sections that link to their headings', (doc) => {
    const { container } = render(<LegalPage doc={doc} />)
    const links = within(screen.getByRole('navigation', { name: 'Contents' })).getAllByRole('link')
    expect(links.length).toBeGreaterThan(5)
    for (const a of links) {
      const id = a.getAttribute('href').slice(1)
      expect(container.querySelector(`h2#${id}`)).not.toBeNull()
    }
  })

  it('makes readable ids from numbered headings', () => {
    expect(slug('2. Who can use Tallyn')).toBe('who-can-use-tallyn')
  })
})
