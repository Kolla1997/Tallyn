import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, routeApi } from '../test/fakeApi.js'
import FamilyPage from './FamilyPage.jsx'

// Family and sharing (#114): people, what you share and what they share,
// owner-only actions, and the step-up for removing someone.
const api = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a) }))
vi.mock('../lib/supabase.js', () => ({ supabase: { auth: { mfa: { listFactors: vi.fn(), challengeAndVerify: vi.fn() } } } }))

const me = { user_id: 'u-me', display_name: 'Sam' }
const owner = { id: 'hh-1', name: 'Test family', role: 'owner', home_currency: 'USD' }
const MEMBERS = [
  { user_id: 'u-me', display_name: 'Sam', role: 'owner', is_you: true },
  { user_id: 'u-pat', display_name: 'Pat', role: 'adult' },
  { user_id: 'u-kid', display_name: 'Robin', role: 'teen' },
]

function answers({ given = [], received = ['balances'], role = 'owner', sharingPut } = {}) {
  // Like the server, sharing remembers what was saved.
  let saved = given
  routeApi(api, [
    ['/api/households/hh-1/members', (p, o) => (o?.method ? null : { members: MEMBERS.map((m) => (m.is_you ? { ...m, role } : m)) })],
    ['/api/sharing?', () => ({ given: { 'u-pat': saved }, received: { 'u-pat': received } })],
    [
      '/api/sharing',
      (p, o) => {
        if (sharingPut) return sharingPut
        saved = o.body.categories
        return null
      },
    ],
    ['/api/banks?', { banks: [] }],
    ['/api/households/hh-1/invites', { invites: [] }],
  ])
}

async function open(household = owner) {
  window.history.replaceState(null, '', '/family?member=u-pat')
  await act(async () => render(<FamilyPage me={me} household={household} refreshKey={0} onChanged={() => {}} onLeft={() => {}} />))
}

const person = () => screen.getByRole('region', { name: /^Pat/ })

describe('FamilyPage', () => {
  beforeEach(() => {
    api.mockReset()
  })

  it('lists everyone, and shows the person you picked', async () => {
    answers()
    await open()
    const list = screen.getByRole('region', { name: 'People in your household' })
    expect(within(list).getByText('Sam')).toBeInTheDocument()
    expect(within(list).getByText('Robin')).toBeInTheDocument()
    expect(within(person()).getByRole('button', { name: 'Adult' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('what Pat shares with you, and the switches for what you share', async () => {
    answers({ received: ['balances', 'transactions'] })
    await open()
    expect(within(person()).getByText('✓ Balances')).toBeInTheDocument()
    expect(within(person()).getByText('✓ Transactions')).toBeInTheDocument()
    expect(within(person()).getByRole('switch', { name: 'Balances' })).not.toBeChecked()
    // Time and location only together with transactions.
    expect(within(person()).getByRole('switch', { name: 'Time and location' })).toBeDisabled()
  })

  it('turning on a switch saves straight away', async () => {
    answers()
    await open()
    await act(async () => fireEvent.click(within(person()).getByRole('switch', { name: 'Balances' })))
    expect(callsTo(api, '/api/sharing', 'PUT')[0][1].body).toEqual({ household_id: 'hh-1', viewer_user_id: 'u-pat', categories: ['balances'] })
    expect(within(person()).getByRole('switch', { name: 'Balances' })).toBeChecked()
  })

  it('turning off transactions also stops sharing time and location', async () => {
    answers({ given: ['balances', 'transactions', 'whereabouts'] })
    await open()
    await act(async () => fireEvent.click(within(person()).getByRole('switch', { name: 'Transactions' })))
    expect(callsTo(api, '/api/sharing', 'PUT')[0][1].body.categories).toEqual(['balances'])
  })

  it('if saving fails, the switch goes back and says so', async () => {
    answers({ sharingPut: new Error('internal') })
    await open()
    await act(async () => fireEvent.click(within(person()).getByRole('switch', { name: 'Balances' })))
    expect(within(person()).getByRole('switch', { name: 'Balances' })).not.toBeChecked()
    expect(within(person()).getByRole('alert')).toHaveTextContent("We couldn't change what you share with Pat.")
  })

  it('owners: invite, change roles and remove; removing needs the name and a fresh code', async () => {
    answers()
    await open()
    expect(screen.getByRole('button', { name: 'Invite someone' })).toBeInTheDocument()
    expect(within(person()).getByRole('group', { name: 'Role for Pat' })).toBeInTheDocument()
    fireEvent.click(within(person()).getByRole('button', { name: 'Remove from household' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove Pat?' })
    expect(within(dialog).getByText(/Type/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/6-digit code/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Remove' })).toBeDisabled()
  })

  it('adults: no invite, no roles, no remove', async () => {
    answers({ role: 'adult' })
    await open({ ...owner, role: 'adult' })
    expect(screen.queryByRole('button', { name: 'Invite someone' })).toBeNull()
    expect(within(person()).queryByRole('group', { name: 'Role for Pat' })).toBeNull()
    expect(within(person()).queryByRole('button', { name: 'Remove from household' })).toBeNull()
  })

  it('nobody shares with teens: no switches for Robin', async () => {
    answers()
    await open()
    fireEvent.click(within(screen.getByRole('region', { name: 'People in your household' })).getByText('Robin'))
    const robin = screen.getByRole('region', { name: /^Robin/ })
    expect(within(robin).queryByRole('switch')).toBeNull()
    expect(within(robin).getByText(/Teens and children only see their own money/)).toBeInTheDocument()
  })
})
