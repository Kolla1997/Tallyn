import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, routeApi } from '../test/fakeApi.js'
import { LoanDetail, LoanDialog, asAccount, loanPayment, totalInterest } from './ManualLoan.jsx'

// Loans Plaid can't see (#306, Dinesh picked C). The made-up Toyota loan: $25,000 at 4.9% over 60 months.
const api = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a) }))
const money = (v) => `$${(v / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const LOAN = {
  id: 'l1',
  name: 'Toyota car loan',
  lender: 'Toyota Financial',
  currency: 'USD',
  principal_minor: 2500000,
  apr: '4.9',
  months: 60,
  first_due: '2025-12-05',
  payment_minor: 47064,
  due_day: 5,
  balance_minor: 2047664,
  interest_paid_minor: 117432,
  interest_this_year_minor: 107224,
  payments_made: 12,
  next_due: '2026-12-05',
  payoff_date: '2030-11-05',
  last: { on: '2026-11-05', paid_minor: 47064, interest_minor: 8508, principal_minor: 38556, extra: false },
  corrected_minor: null,
  corrected_on: null,
}

describe('ManualLoan', () => {
  beforeEach(() => {
    api.mockReset()
    HTMLDialogElement.prototype.showModal ??= function () {
      this.open = true
    }
    HTMLDialogElement.prototype.close ??= function () {
      this.open = false
    }
  })

  it('works out the payment as the server does', () => {
    expect(loanPayment(2500000, 4.9, 60)).toBe(47064)
    expect(loanPayment(120000, 0, 12)).toBe(10000)
    expect(totalInterest(2500000, 4.9, 60)).toBeGreaterThan(320000)
  })

  it('becomes an Other loan on Debts', () => {
    expect(asAccount(LOAN, 'u-me')).toMatchObject({
      type: 'loan',
      current_balance_minor: 2047664,
      loan: { rate_percent: '4.9', original_minor: 2500000, payoff_date: '2030-11-05' },
    })
  })

  it('shows what is left, three facts and where the last payment went', () => {
    render(<LoanDetail loan={LOAN} money={money} onChanged={() => {}} />)
    expect(screen.getByText('$20,476.64')).toBeInTheDocument()
    expect(screen.getByText('18% paid off')).toBeInTheDocument()
    expect(screen.getByText('Nov 2030')).toBeInTheDocument()
    expect(screen.getByText('A month, due on the 5th')).toBeInTheDocument()
    expect(screen.getByText('$85.08')).toBeInTheDocument() // interest in the last payment
    expect(screen.getByText('$385.56')).toBeInTheDocument() // off the balance
  })

  it('adds a loan, showing the payment as you type', async () => {
    routeApi(api, [['/api/loans', { id: 'l1' }]])
    const onSaved = vi.fn()
    render(<LoanDialog household={{ id: 'hh-1', home_currency: 'USD' }} onClose={() => {}} onSaved={onSaved} />)
    const dlg = within(screen.getByRole('dialog', { name: 'Add a loan' }))
    fireEvent.change(dlg.getByLabelText('Name'), { target: { value: 'Toyota car loan' } })
    fireEvent.change(dlg.getByLabelText('Amount borrowed (USD)'), { target: { value: '25,000' } })
    fireEvent.change(dlg.getByLabelText('Interest (APR %)'), { target: { value: '4.9' } })
    fireEvent.change(dlg.getByLabelText('Length (months)'), { target: { value: '60' } })
    fireEvent.change(dlg.getByLabelText('First payment'), { target: { value: '2025-12-05' } })
    expect(dlg.getByText('$470.64')).toBeInTheDocument()
    expect(dlg.getByText('Nov 2030')).toBeInTheDocument()
    await act(async () => fireEvent.click(dlg.getByRole('button', { name: 'Add loan' })))
    const [[, opts]] = callsTo(api, '/api/loans', 'POST')
    expect(opts.body).toEqual({
      household_id: 'hh-1',
      name: 'Toyota car loan',
      lender: '',
      principal_minor: 2500000,
      apr: '4.9',
      months: 60,
      first_due: '2025-12-05',
      balance_minor: null,
    })
    expect(onSaved).toHaveBeenCalled()
  })
})
