import { render, screen } from '@testing-library/react'
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
})
