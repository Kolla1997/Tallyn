import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, routeApi } from '../test/fakeApi.js'
import BillReminder, { toRecord } from './BillReminder.jsx'

// Bill reminders (#126, Dinesh picked B). All names and amounts are made up.
const api = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a) }))

const owner = { id: 'hh-1', role: 'owner', home_currency: 'USD' }
const bill = (id, name, amount) => ({ id, name, amount_minor: amount, currency: 'USD', varies: false, frequency: 'monthly' })
const BILLS = [bill('rent', 'Rent', 150000), bill('net', 'Internet', 7000), bill('gas', 'Gas', 6490), bill('car', 'Car insurance', 12600)]
const DUES = [
  { bill_id: 'rent', due: '2026-11-09', status: 'due', expected_minor: 150000 },
  { bill_id: 'net', due: '2026-11-03', status: 'late', expected_minor: 7000 },
  { bill_id: 'gas', due: '2026-11-01', status: 'paid', expected_minor: 6490, paid_minor: 6490 },
  { bill_id: 'car', due: '2026-11-28', status: 'due', expected_minor: 12600 },
]
const answers = () =>
  routeApi(api, [
    [/^\/api\/bills\/[a-z]+\/payments\//, null],
    ['/api/bills', { today: '2026-11-09', month: '2026-11', bills: BILLS, dues: DUES }],
  ])
const open = async (household = owner) => act(async () => render(<BillReminder household={household} />))

describe('BillReminder', () => {
  beforeEach(() => {
    api.mockReset()
    localStorage.clear()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-09T12:00:00'))
    HTMLDialogElement.prototype.showModal ??= function () {
      this.open = true
    }
    HTMLDialogElement.prototype.close ??= function () {
      this.open = false
    }
  })
  afterEach(() => vi.useRealTimers())

  it('asks only about bills due today or late', () => {
    expect(toRecord(DUES, '2026-11-09').map((d) => d.bill_id)).toEqual(['rent', 'net'])
  })

  it('pops up on opening and marks a bill paid', async () => {
    answers()
    await open()
    const dlg = within(screen.getByRole('dialog', { name: '2 bills to record' }))
    expect(dlg.getByText('Due today')).toBeInTheDocument()
    expect(dlg.getByText('Late · was due Nov 3')).toBeInTheDocument()
    await act(async () => fireEvent.click(dlg.getAllByRole('button', { name: 'Mark paid' })[0]))
    const [[, opts]] = callsTo(api, '/api/bills/rent/payments/2026-11-09', 'PUT')
    expect(opts.body).toEqual({ paid_minor: 150000, paid_on: '2026-11-09' })
    expect(screen.getByRole('dialog', { name: '1 bill to record' })).toBeInTheDocument()
  })

  it('Not yet and Later hide bills until tomorrow', async () => {
    answers()
    const first = await open()
    const dlg = within(screen.getByRole('dialog'))
    await act(async () => fireEvent.click(dlg.getAllByRole('button', { name: 'Not yet' })[0]))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Later' })))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    first.unmount()
    await open()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // same day: hidden
    vi.setSystemTime(new Date('2026-11-10T09:00:00'))
    await open()
    expect(screen.getByRole('dialog', { name: '1 bill to record' })).toBeInTheDocument() // next day: Internet (still late) is back
  })

  it('also asks about bills still unpaid from earlier months', async () => {
    routeApi(api, [
      [
        '/api/bills',
        {
          today: '2026-11-09',
          month: '2026-11',
          bills: BILLS,
          dues: DUES,
          earlier: [{ bill_id: 'net', due: '2026-10-03', status: 'late', expected_minor: 7000 }],
        },
      ],
    ])
    await open()
    const dlg = within(screen.getByRole('dialog', { name: '3 bills to record' }))
    expect(dlg.getByText('Late · was due Oct 3')).toBeInTheDocument()
    expect(dlg.getByText('Late · was due Nov 3')).toBeInTheDocument()
  })

  it('never asks people who aren’t owners', async () => {
    answers()
    await open({ ...owner, role: 'adult' })
    expect(api).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
