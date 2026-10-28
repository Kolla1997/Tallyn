import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, routeApi } from '../test/fakeApi.js'
import GoalsPage from './GoalsPage.jsx'

// Savings goals (#14, Dinesh picked the mix): This month, pots, and the
// opened goal's forecast. All names and amounts are made up.
const api = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a) }))

const me = { user_id: 'u-me' }
const owner = { id: 'hh-1', role: 'owner', home_currency: 'USD' }
const months = (pairs) => pairs.map(([m, v]) => ({ month: `2026-${m}-01`, saved_minor: v }))
const GOALS = [
  {
    id: 'g-beach',
    owner_user_id: 'u-me',
    name: 'Beach trip',
    target_minor: 500000,
    currency: 'USD',
    by_month: '2027-06-01',
    account_id: null,
    visibility: 'member',
    shared_with: 'u-james',
    can_manage: true,
    saved_minor: 340000,
    history: months([
      ['05', 180000],
      ['06', 210000],
      ['07', 240000],
      ['08', 270000],
      ['09', 300000],
      ['10', 340000],
    ]),
  },
  {
    id: 'g-paris',
    owner_user_id: 'u-me',
    name: 'Paris trip',
    target_minor: 200000,
    currency: 'EUR',
    by_month: '2027-08-01',
    account_id: null,
    visibility: 'me',
    shared_with: null,
    can_manage: true,
    saved_minor: 30000,
    history: months([['09', 30000]]),
  },
  {
    id: 'g-pat',
    owner_user_id: 'u-pat',
    name: "Pat's car fund",
    target_minor: 800000,
    currency: 'USD',
    by_month: null,
    account_id: 'a-9',
    visibility: 'everyone',
    shared_with: null,
    can_manage: false,
    saved_minor: null,
    history: null,
  },
]
const MEMBERS = [
  { user_id: 'u-me', display_name: 'Sam', role: 'owner' },
  { user_id: 'u-james', display_name: 'James', role: 'adult' },
  { user_id: 'u-pat', display_name: 'Pat', role: 'adult' },
]

function answers(goals = GOALS) {
  routeApi(api, [
    ['/api/goals/g-paris/saved', null],
    ['/api/goals', (path, opts) => (opts?.method === 'POST' ? { id: 'g-new' } : { today: '2026-10-24', goals })],
    ['/api/households/hh-1/members', { members: MEMBERS }],
    ['/api/banks', { banks: [] }],
  ])
}
const open = async (household = owner) => act(async () => render(<GoalsPage me={me} household={household} refreshKey={0} />))

describe('GoalsPage', () => {
  beforeEach(() => {
    api.mockReset()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T12:00:00'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('this month first, then pots, then the opened goal', async () => {
    answers()
    await open()
    expect(screen.getByRole('heading', { name: '1 of 2 set-asides are done this month.' })).toBeInTheDocument()
    expect(screen.getByText(/Paris trip still needs €170\.00 by 31 Oct\./)).toBeInTheDocument()
    const pots = within(screen.getByRole('region', { name: 'Your goals' }))
    expect(pots.getByRole('button', { name: /Beach trip.*\$1,600\.00 to go/ })).toHaveAttribute('aria-pressed', 'true')
    // Pat's goal follows an account Sam can't see: name and target only.
    const pat = pots.getByRole('button', { name: /Pat's car fund/ })
    expect(pat).toBeDisabled()
    expect(within(pat).getByText('Progress is private')).toBeInTheDocument()
    const detail = within(screen.getByRole('region', { name: 'Beach trip' }))
    expect(detail.getByText('At this pace you’ll be there in March 2027, about 3 months early.')).toBeInTheDocument()
    expect(detail.getByText('to three quarters.', { exact: false })).toBeInTheDocument()
    expect(detail.getByText('Who can see it: You and James.')).toBeInTheDocument()
  })

  it('updates a goal kept by hand', async () => {
    answers()
    await open()
    fireEvent.click(screen.getByRole('button', { name: /Paris trip/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Update amount' }))
    fireEvent.change(screen.getByLabelText('Saved so far (EUR)'), { target: { value: '470' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })))
    expect(callsTo(api, '/api/goals/g-paris/saved', 'PUT')[0][1].body).toEqual({ saved_minor: 47000 })
  })

  it('creates a goal kept by hand', async () => {
    answers([])
    await open()
    expect(screen.getByRole('heading', { name: 'No goals yet' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New goal' }))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' Beach trip ' } })
    fireEvent.click(screen.getByRole('radio', { name: /^I'll update it myself/ }))
    fireEvent.change(screen.getByLabelText('Target (USD)'), { target: { value: '5000' } })
    fireEvent.click(screen.getByRole('button', { name: /By \(optional\)/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Next year' }))
    fireEvent.click(screen.getByRole('button', { name: 'June 2027' }))
    fireEvent.click(screen.getByRole('button', { name: 'Everyone in the household' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create goal' })))
    expect(callsTo(api, '/api/goals', 'POST')[0][1].body).toEqual({
      household_id: 'hh-1',
      owner_user_id: 'u-me',
      name: ' Beach trip ',
      target_minor: 500000,
      currency: 'USD',
      by_month: '2027-06',
      account_id: '',
      visibility: 'everyone',
      shared_with: '',
    })
  })

  it('a child sees goals but sets none up', async () => {
    answers()
    await open({ ...owner, role: 'child' })
    expect(screen.queryByRole('button', { name: 'New goal' })).not.toBeInTheDocument()
  })
})
