import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Markdown from './Markdown.jsx'

// A "#" line that isn't a level 1–3 heading used to stall the parser for good (#154).
describe('Markdown', () => {
  it('shows "####" and "#12" lines as text instead of hanging', () => {
    render(<Markdown text={'## Title\n\n#### Small heading\n#12 is a ticket\n\nNext paragraph'} />)
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument()
    expect(screen.getByText('#### Small heading')).toBeInTheDocument()
    expect(screen.getByText('#12 is a ticket')).toBeInTheDocument()
    expect(screen.getByText('Next paragraph')).toBeInTheDocument()
  })
})
