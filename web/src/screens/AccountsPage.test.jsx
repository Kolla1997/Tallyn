import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callsTo, routeApi } from '../test/fakeApi.js'
import AccountsPage from './AccountsPage.jsx'

// Accounts (#114): net worth, You have / You owe by type, hidden balances,
// whose accounts and which bank, and each bank's status with Reconnect and
// Unlink only where allowed.
const api = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a) }))
vi.mock('react-plaid-link', () => ({ usePlaidLink: () => ({ open: vi.fn(), ready: false }) }))

const me = { user_id: 'u-me', display_name: 'Sam' }
const owner = { id: 'hh-1', name: 'Test family', role: 'owner', home_currency: 'USD' }
const acct = (id, name, type, subtype, minor) => ({ id, name, type, subtype, currency: 'USD', current_balance_minor: minor, mask: '0000' })
const B1 = '11111111-1111-4111-8111-111111111111'
const B2 = '22222222-2222-4222-8222-222222222222'
const B3 = '33333333-3333-4333-8333-333333333333'
const BANKS = [
  {
    id: B1,
    owner_user_id: 'u-me',
    institution_name: 'Fake Credit Union',
    status: 'active',
    can_unlink: true,
    last_synced_at: new Date().toISOString(),
    accounts: [acct('a-1', 'Everyday checking', 'depository', 'checking', 100000), acct('a-2', 'Rainy day savings', 'depository', 'savings', 250000)],
  },
  {
    id: B2,
    owner_user_id: 'u-me',
    institution_name: 'Fake Card Co',
    status: 'needs_reauth',
    can_unlink: true,
    accounts: [acct('a-3', 'Fake card', 'credit', 'credit card', 30000)],
  },
  // Pat shares that the account exists, not its balance (#28).
  {
    id: B3,
    owner_user_id: 'u-pat',
    institution_name: 'Fake Bank',
    status: 'active',
    can_unlink: false,
    accounts: [acct('a-4', 'Pat checking', 'depository', 'checking', null)],
  },
]
const MEMBERS = [
  { user_id: 'u-me', display_name: 'Sam', role: 'owner', is_you: true },
  { user_id: 'u-pat', display_name: 'Pat', role: 'adult' },
]

function answers(banks = BANKS) {
  routeApi(api, [
    ['/api/banks?', { banks }],
    ['/api/households/hh-1/members', { members: MEMBERS }],
    [/^\/api\/banks\/[0-9a-f-]+$/, null], // unlink
  ])
}

async function open(household = owner) {
  await act(async () => render(<AccountsPage me={me} household={household} refreshKey={0} onChanged={() => {}} />))
}

const has = (scope, text) => expect(within(scope).getAllByText(text).length).toBeGreaterThan(0)

describe('AccountsPage', () => {
  beforeEach(() => {
    api.mockReset()
    window.history.replaceState(null, '', '/accounts')
  })

  it('net worth, and your accounts by type in two columns', async () => {
    answers()
    await open()
    const net = screen.getByRole('region', { name: 'Net worth' })
    has(net, '$3,200.00')
    has(net, '$3,500.00')
    has(net, '$300.00')
    const have = screen.getByRole('region', { name: /You have/ })
    expect(within(have).getByRole('heading', { name: /Everyday/ })).toBeInTheDocument()
    expect(within(have).getByRole('heading', { name: /Savings/ })).toBeInTheDocument()
    expect(within(have).getByText('Rainy day savings')).toBeInTheDocument()
    const owe = screen.getByRole('region', { name: /You owe/ })
    expect(within(owe).getByRole('heading', { name: /Credit cards/ })).toBeInTheDocument()
    expect(within(owe).getByText('Fake card')).toBeInTheDocument()
    // Pat's account isn't yours.
    expect(screen.queryByText('Pat checking')).toBeNull()
  })

  it('whose accounts: Pat’s show without a balance, and Everyone shows all', async () => {
    answers()
    await open()
    const who = screen.getByRole('group', { name: 'Whose accounts' })
    fireEvent.click(within(who).getByRole('button', { name: 'Pat' }))
    const have = screen.getByRole('region', { name: /have/i })
    const row = within(have).getByText('Pat checking').closest('li')
    expect(within(row).getByText('—')).toBeInTheDocument()
    fireEvent.click(within(who).getByRole('button', { name: 'Everyone' }))
    expect(screen.getByText('Pat checking')).toBeInTheDocument()
    expect(screen.getByText('Everyday checking')).toBeInTheDocument()
  })

  it('a bank chip narrows the columns to that bank; net worth stays whole', async () => {
    answers()
    await open()
    fireEvent.click(within(screen.getByRole('group', { name: 'Which bank' })).getByRole('button', { name: /Fake Card Co/ }))
    expect(screen.queryByText('Everyday checking')).toBeNull()
    expect(screen.getByText('Fake card')).toBeInTheDocument()
    has(screen.getByRole('region', { name: 'Net worth' }), '$3,200.00')
    expect(window.location.search).toBe(`?bank=${B2}`)
  })

  it('connected banks: status, Reconnect only when it needs you, Unlink only where allowed', async () => {
    answers()
    await open()
    fireEvent.click(within(screen.getByRole('group', { name: 'Whose accounts' })).getByRole('button', { name: 'Everyone' }))
    const banks = screen.getByRole('region', { name: 'Connected banks' })
    const item = (name) => within(banks).getByText(name).closest('li')
    expect(within(item('Fake Credit Union')).getByText(/Up to date/)).toBeInTheDocument()
    expect(within(item('Fake Credit Union')).queryByRole('button', { name: 'Reconnect' })).toBeNull()
    expect(within(item('Fake Card Co')).getByText('Needs you to sign in again')).toBeInTheDocument()
    expect(within(item('Fake Card Co')).getByRole('button', { name: 'Reconnect' })).toBeInTheDocument()
    expect(within(item('Fake Bank')).queryByRole('button', { name: 'Unlink' })).toBeNull()
  })

  it('Unlink asks you to type the bank’s name, then removes it', async () => {
    answers()
    await open()
    const banks = screen.getByRole('region', { name: 'Connected banks' })
    fireEvent.click(within(within(banks).getByText('Fake Credit Union').closest('li')).getByRole('button', { name: 'Unlink' }))
    const dialog = screen.getByRole('dialog', { name: 'Unlink Fake Credit Union?' })
    const go = within(dialog).getByRole('button', { name: 'Unlink' })
    expect(go).toBeDisabled()
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'fake credit union' } })
    await act(async () => fireEvent.click(go))
    expect(callsTo(api, `/api/banks/${B1}`, 'DELETE')).toHaveLength(1)
  })

  it('empty: says how to start, or that nothing is linked', async () => {
    answers([])
    await open()
    expect(screen.getByText('You haven’t linked a bank yet. Use Link a bank above.')).toBeInTheDocument()
    document.body.innerHTML = ''
    await open({ ...owner, role: 'viewer' })
    expect(screen.getByText('You don’t have any banks linked.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Link a bank' })).toBeNull()
  })
})
