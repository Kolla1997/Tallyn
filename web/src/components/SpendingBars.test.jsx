import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SpendingBars from './SpendingBars.jsx'

// Spending by day (#187): one bar per day, each a button naming its date and amount; picking a
// day narrows the list, picking it again clears it; the average and the biggest day are written.
const days = [
  { date: '2020-03-02', currency: 'USD', amount_minor: 149500 },
  { date: '2020-03-03', currency: 'USD', amount_minor: 6200 },
  { date: '2020-03-04', currency: 'USD', amount_minor: 3000 },
]

describe('SpendingBars', () => {
  it('names each day, picks one and clears it again', () => {
    const onPick = vi.fn()
    const { rerender } = render(<SpendingBars month="2020-03" days={days} home="USD" selected="" onPick={onPick} />)
    expect(screen.getByRole('button', { name: 'Tue, Mar 3: $62.00' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tue, Mar 3: $62.00' }))
    expect(onPick).toHaveBeenLastCalledWith('2020-03-03')
    rerender(<SpendingBars month="2020-03" days={days} home="USD" selected="2020-03-03" onPick={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tue, Mar 3: $62.00' }))
    expect(onPick).toHaveBeenLastCalledWith('')
  })

  it('says the biggest and quietest day', () => {
    render(<SpendingBars month="2020-03" days={days} home="USD" selected="" onPick={() => {}} />)
    expect(screen.getByText('Biggest day').nextSibling).toHaveTextContent('$1,495.00')
    expect(screen.getByText('Quietest day').nextSibling).toHaveTextContent('$30.00')
  })
})
