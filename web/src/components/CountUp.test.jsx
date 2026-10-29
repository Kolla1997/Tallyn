import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CountUp from './CountUp.jsx'

// Counting numbers use tabular figures, so digits don't move the layout as they
// change (#193). Screen readers still get the final value once.
describe('CountUp', () => {
  it('draws the visible number with tabular figures', () => {
    const { container } = render(<CountUp value={1234} format={(v) => `$${v}`} />)
    const visible = container.querySelector('[aria-hidden="true"]')
    expect(visible).toHaveTextContent('$1234')
    expect(visible).toHaveClass('tabular-nums')
  })

  it('gives screen readers the final value only once', () => {
    render(<CountUp value={50} format={(v) => `${v} kr`} />)
    expect(screen.getByText('50 kr', { selector: '.sr-only' })).toBeInTheDocument()
  })

  // #228: on a page load, figures count up from 0; with reduced motion they show the value at once.
  it('counts up from start on the first show', async () => {
    const real = window.matchMedia
    window.matchMedia = (query) => ({ ...real(query), matches: false })
    try {
      const { container } = render(<CountUp value={900} start={0} format={(v) => `$${v}`} />)
      const visible = container.querySelector('[aria-hidden="true"]')
      expect(visible).toHaveTextContent('$0')
      await waitFor(() => expect(visible).toHaveTextContent('$900'), { timeout: 3000 })
    } finally {
      window.matchMedia = real
    }
  })

  it('skips the count with reduced motion', () => {
    const { container } = render(<CountUp value={900} start={0} format={(v) => `$${v}`} />)
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('$900')
  })
})
