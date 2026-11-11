import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MonthlyCommitments, { dayOf, monthlyOf, startsOn } from './MonthlyCommitments.jsx'

// The step after Create household (#307): chips add payments the bank feed can't see, saved as
// bills (#127) and a car loan as a manual loan (#306). Skippable; nothing is saved twice.
const api = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a) }))

const household = { id: 'h1', home_currency: 'USD' }
const click = (name) => fireEvent.click(screen.getByRole('button', { name }))
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const save = (name = 'Save and continue') => act(async () => click(name))
function addBill(chip, amount, day) {
  click(chip)
  type(`Amount for ${chip}`, amount)
  type(`Due day for ${chip}`, day)
  click('Done')
}
function setup() {
  const onDone = vi.fn()
  render(<MonthlyCommitments household={household} onDone={onDone} />)
  return onDone
}

beforeEach(() => {
  api.mockReset()
  api.mockResolvedValue({})
})

describe('MonthlyCommitments', () => {
  it('can be skipped without saving anything', () => {
    const onDone = setup()
    expect(screen.getByText('Nothing added yet.')).toBeTruthy()
    click('Skip for now')
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(api).not.toHaveBeenCalled()
  })

  it('adds bills from the chips, totals them, shows their due days and saves each as a monthly bill', async () => {
    const onDone = setup()
    addBill('Rent / Mortgage', '1850', '1')
    addBill('Electric', '96', '14')
    expect(screen.getByRole('button', { name: 'Rent / Mortgage' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Due on the 1st')).toBeTruthy()
    expect(screen.getByText('Due on the 14th · typical amount')).toBeTruthy()
    expect(screen.getAllByText('$1,946.00').length).toBeGreaterThan(0)
    expect(screen.getByRole('img', { name: 'Due days across the month: 1st, 14th' })).toBeTruthy()
    expect(screen.getByText(/of it is due in the first week/).textContent).toContain('$1,850.00')
    expect(api).not.toHaveBeenCalled()

    await save()
    expect(api).toHaveBeenCalledTimes(2)
    expect(api).toHaveBeenNthCalledWith(1, '/api/bills', {
      method: 'POST',
      body: {
        household_id: 'h1',
        name: 'Rent / Mortgage',
        amount_minor: 185000,
        varies: false,
        frequency: 'monthly',
        due_day: 1,
        starts_on: expect.stringMatching(/^\d{4}-\d{2}$/),
        category: 'housing',
        paused: false,
      },
    })
    expect(api.mock.calls[1][1].body).toMatchObject({ name: 'Electric', amount_minor: 9600, varies: true, due_day: 14, category: 'utilities' })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('works out a car loan payment and saves it as a loan', async () => {
    const onDone = setup()
    click('Car loan')
    type('Amount borrowed', '25000')
    type('Interest, APR percent', '4.9')
    type('Length in months', '60')
    type('First payment date', '2025-12-05')
    expect(screen.getByText(/Your payment:/).textContent).toContain('$470.64 a month, due on the 5th')
    click('Done')
    expect(screen.getByText('Due on the 5th · loan')).toBeTruthy()

    await save()
    expect(api).toHaveBeenCalledWith('/api/loans', {
      method: 'POST',
      body: {
        household_id: 'h1',
        name: 'Car loan',
        lender: '',
        principal_minor: 2500000,
        apr: '4.9',
        months: 60,
        first_due: '2025-12-05',
        balance_minor: null,
      },
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('saves Other under the name you give it, and can add more than one', async () => {
    setup()
    click('Other')
    type('Name', 'Childcare')
    type('Amount for Childcare', '400')
    type('Due day for Childcare', '15')
    click('Done')
    click('Other')
    expect(screen.getByRole('button', { name: 'Edit Childcare' })).toBeTruthy()
    click('Remove payment')
    await save()
    expect(api).toHaveBeenCalledTimes(1)
    expect(api.mock.calls[0][1].body).toMatchObject({ name: 'Childcare', amount_minor: 40000, due_day: 15, category: 'other', varies: false })
  })

  it('removes a payment from its row or by tapping its chip again', () => {
    setup()
    addBill('Internet', '65', '20')
    click('Remove Internet')
    expect(screen.getByText('Nothing added yet.')).toBeTruthy()
    addBill('Internet', '65', '20')
    click('Internet')
    expect(screen.getByText('Nothing added yet.')).toBeTruthy()
  })

  it('asks you to finish or remove a half-filled payment before saving', async () => {
    const onDone = setup()
    click('Gas')
    click('Done')
    await save()
    expect(screen.getByRole('alert').textContent).toMatch(/Finish Gas: the amount and the day it's due/)
    expect(screen.getByLabelText('Amount for Gas')).toBeTruthy() // its editor is open again
    expect(api).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('keeps what saved, and tries only the failed payment again', async () => {
    const onDone = setup()
    addBill('Rent / Mortgage', '1850', '1')
    addBill('Internet', '65', '20')
    api.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('down'))
    await save()
    expect(screen.getByRole('alert').textContent).toBe("We couldn't save Internet. Try again, or continue and add it later in Bills.")
    expect(screen.getByText('Saved')).toBeTruthy()
    expect(screen.getByText('Not saved')).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()

    await save('Try again')
    expect(api).toHaveBeenCalledTimes(3)
    expect(api.mock.calls[2][1].body.name).toBe('Internet')
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('lets you continue without a payment that would not save', async () => {
    const onDone = setup()
    addBill('Water', '40', '9')
    api.mockRejectedValueOnce(new Error('down'))
    await save()
    click('Continue without it')
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(api).toHaveBeenCalledTimes(1)
  })
})

describe('monthly commitments helpers', () => {
  it('starts a bill this month, or next month once its day has passed', () => {
    expect(startsOn(11, '2026-11-11')).toBe('2026-11')
    expect(startsOn(28, '2026-11-11')).toBe('2026-11')
    expect(startsOn(1, '2026-11-11')).toBe('2026-12')
    expect(startsOn(20, '2026-12-25')).toBe('2027-01')
  })

  it('reads the monthly amount and due day of a bill and of a loan', () => {
    const bill = { k: 'rent', name: 'Rent / Mortgage', amount: '1,850.00', day: '31' }
    expect(monthlyOf(bill, 'USD')).toBe(185000)
    expect(dayOf(bill)).toBe(31)
    expect(dayOf({ ...bill, day: '32' })).toBe(0)
    expect(monthlyOf({ ...bill, amount: 'lots' }, 'USD')).toBe(0)
    const loan = { k: 'car', name: 'Car loan', principal: '25000', apr: '4.9', months: '60', first: '2025-12-05' }
    expect(monthlyOf(loan, 'USD')).toBe(47064)
    expect(dayOf(loan)).toBe(5)
    expect(monthlyOf({ ...loan, months: '' }, 'USD')).toBe(0)
  })
})
