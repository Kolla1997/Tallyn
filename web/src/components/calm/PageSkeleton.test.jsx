import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PageSkeleton from './PageSkeleton.jsx'

// #212, #221: a loading page shows only the animated Coinroof mark, announced once to screen readers.
describe('PageSkeleton', () => {
  it('announces loading and shows only the mark, hidden from screen readers', () => {
    const { container } = render(<PageSkeleton />)
    expect(screen.getByRole('status')).toHaveTextContent('Adding it all up')
    expect(container.querySelectorAll('[aria-hidden="true"] img[alt=""]').length).toBe(2)
    expect(container.querySelectorAll('.calm-bar').length).toBe(0)
  })
})
