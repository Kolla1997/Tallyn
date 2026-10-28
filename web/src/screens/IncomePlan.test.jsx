import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routeApi, callsTo } from '../test/fakeApi.js'
import IncomePlan from './IncomePlan.jsx'

// Plan from your income (#133, Dinesh picked 3A). All amounts made up.
const api = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a) }))

const me = { user_id: 'u-me' }
const owner = { id: 'hh-1', role: 'owner', home_currency: 'USD' }
const today = '2026-10-24'
const PLAN = {
  id: 'p1',
  member_user_id: null,
  monthly_income_minor: 640000,
  currency: 'USD',
  template: '55-5-10-15-15',
  shares: { essentials: 55, guilt_free: 5, debt: 10, short_term: 15, long_term: 15 },
  from: '2026-10-01',
  to: '2026-11-01',
  progress: { essentials: 278000, guilt_free: 36500, debt: 60000, short_term: 40000, long_term: 96000 },
  can_manage: true,
}

const open = async (household = owner) => act(async () => render(<IncomePlan me={me} household={household} today={today} />))

describe('IncomePlan', () => {
  beforeEach(() => {
    api.mockReset()
  })

  it('shows the answer first, then the split, then each job', async () => {
    routeApi(api, [['/api/plans', { plans: [PLAN] }]])
    await open()
    expect(screen.getByRole('heading', { name: "You're mostly on track this month." })).toBeInTheDocument()
    expect(screen.getByText('Guilt-free is $45.00 over, and $560.00 is still to move to savings. 24 of 31 days gone.')).toBeInTheDocument()
    expect(screen.getByText('55 / 5 / 10 / 15 / 15')).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem').filter((li) => li.classList.contains('plan-row'))
    expect(rows.map((r) => r.querySelector('.plan-words').textContent)).toEqual(['$740.00 left', '$45.00 over', '$40.00 to move', '$560.00 to move', 'Done'])
    expect(screen.getByText(/isn.t counted here/)).toBeInTheDocument()
  })

  it('no plan yet: suggests the income from pay, then saves the template', async () => {
    routeApi(api, [
      ['/api/plans/suggestion', { monthly_income_minor: 500000 }],
      ['/api/plans', (path, opts) => (opts?.method === 'PUT' ? { id: 'p1' } : { plans: [] })],
    ])
    await open()
    expect(screen.getByRole('heading', { name: 'Plan your month' })).toBeInTheDocument()
    expect(screen.getByLabelText('Monthly income')).toHaveValue('5000.00')
    expect(screen.getByText(/Suggested from your pay in July to September/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /50 \/ 30 \/ 20/ }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start my plan' })))
    expect(callsTo(api, '/api/plans', 'PUT')[0][1].body).toEqual({
      household_id: 'hh-1',
      member_user_id: '',
      monthly_income_minor: 500000,
      template: '50-30-20',
      shares: { needs: 50, wants: 30, save: 20 },
    })
  })

  it('your own split must add up to 100%', async () => {
    routeApi(api, [
      ['/api/plans/suggestion', { monthly_income_minor: 0 }],
      ['/api/plans', { plans: [] }],
    ])
    await open()
    expect(screen.getByText(/didn.t find regular pay/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Monthly income'), { target: { value: '6400' } })
    fireEvent.click(screen.getByRole('radio', { name: /Your own/ }))
    fireEvent.change(screen.getByLabelText('Essentials'), { target: { value: '50' } })
    expect(screen.getByText('Adds up to 95%, needs to be 100%')).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start my plan' })))
    expect(screen.getByRole('alert')).toHaveTextContent('add up to 100%')
    expect(callsTo(api, '/api/plans', 'PUT')).toHaveLength(0)
  })

  it('a child sees the household plan but has no plan of their own to set', async () => {
    routeApi(api, [['/api/plans', { plans: [] }]])
    await open({ ...owner, role: 'child' })
    expect(screen.getByRole('heading', { name: 'No household plan yet' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Just me' })).not.toBeInTheDocument()
  })
})
