import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TxSummary } from './TxSummary.jsx'

// The Transactions summary (#58): the category legend lists every category
// with its share. (A legend hidden by CSS, as in #94, needs a browser test.)
const totals = {
  currency: 'USD',
  money_in_minor: 350000,
  spent_minor: 1000,
  transfers_minor: 2500,
  categories: [
    { category: 'FOOD_AND_DRINK', amount_minor: 600, count: 3 },
    { category: 'TRANSPORTATION', amount_minor: 400, count: 2 },
  ],
  merchants: [{ merchant: 'Uber', amount_minor: 400, count: 2 }],
}

describe('TxSummary', () => {
  it('shows totals, the category legend and top merchants', () => {
    render(<TxSummary totals={totals} scope="All time · yours" month="" day="" />)
    expect(screen.getByText('All time · yours')).toBeInTheDocument()
    expect(screen.getByText("Transfers and loan payments ($25.00) aren't counted as spending.")).toBeInTheDocument()
    const legend = screen.getByRole('list', { name: /categories/i })
    expect(within(legend).getByText('Food and drink')).toBeInTheDocument()
    expect(within(legend).getByText('60%')).toBeInTheDocument()
    expect(within(legend).getByText('Transportation')).toBeInTheDocument()
    expect(within(legend).getByText('40%')).toBeInTheDocument()
    expect(screen.getByText('Uber')).toBeInTheDocument()
  })
})
