import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PageSkeleton from './PageSkeleton.jsx'

// #212: a loading page shows grey card shapes, announced once to screen readers.
describe('PageSkeleton', () => {
  it('announces loading and hides the bars from screen readers', () => {
    const { container } = render(<PageSkeleton />)
    expect(screen.getByRole('status')).toHaveTextContent('Adding it all up')
    expect(container.querySelectorAll('[aria-hidden="true"] .calm-bar').length).toBeGreaterThan(0)
  })
})
