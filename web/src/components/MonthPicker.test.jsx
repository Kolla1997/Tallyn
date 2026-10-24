import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import MonthPicker, { awayWords } from './MonthPicker.jsx'

// The goal month picker (#14, the mix of the month draft). Today is 24 Oct 2026.
function Picker({ start = '' }) {
  const [value, setValue] = useState(start)
  return (
    <>
      <MonthPicker label="By (optional)" value={value} onChange={setValue} today="2026-10-24" />
      <output>{value || 'none'}</output>
    </>
  )
}
const field = () => screen.getByRole('button', { name: /By \(optional\)/ })

describe('MonthPicker', () => {
  it('reads in words, and how far away it is', () => {
    render(<Picker start="2027-06" />)
    expect(field()).toHaveTextContent('June 2027 · 8 months away')
    expect(awayWords(12)).toBe('1 year away')
    expect(awayWords(1)).toBe('1 month away')
    expect(awayWords(-2)).toBe('passed')
  })

  it('a quick pick sets the month and shows it in the grid', () => {
    render(<Picker />)
    expect(field()).toHaveTextContent('Any time')
    fireEvent.click(field())
    fireEvent.click(screen.getByRole('button', { name: '1 year' }))
    expect(screen.getByRole('status')).toHaveTextContent('2027-10')
    expect(screen.getByRole('button', { name: 'October 2027' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'No date' }))
    expect(screen.getByRole('status')).toHaveTextContent('none')
  })

  it('past months are off; picking a month closes the panel', () => {
    render(<Picker />)
    fireEvent.click(field())
    fireEvent.click(screen.getByRole('button', { name: 'Previous year' }))
    expect(screen.getByRole('button', { name: 'October 2026' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous year' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'December 2026' }))
    expect(screen.getByRole('status')).toHaveTextContent('2026-12')
    expect(field()).toHaveAttribute('aria-expanded', 'false')
    expect(field()).toHaveTextContent('December 2026 · 2 months away')
  })

  it('Escape closes the panel, not the dialog around it', () => {
    render(<Picker />)
    fireEvent.click(field())
    const panel = screen.getByRole('group', { name: 'By (optional)' })
    expect(fireEvent.keyDown(panel, { key: 'Escape' })).toBe(false) // default prevented
    expect(screen.queryByRole('group', { name: 'By (optional)' })).toBeNull()
    expect(field()).toHaveFocus()
  })
})
