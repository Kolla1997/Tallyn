import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LinkBank } from './Banks.jsx'

// Connect a bank (#115): the Plaid link token is asked for on click, never
// when the button appears, so moving around the app can't use up the Plaid
// rate limit (#24).
const api = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a) }))

// A stand-in for Plaid Link: ready once it has a token; tests drive its callbacks.
const plaid = { open: vi.fn(), config: null }
vi.mock('react-plaid-link', () => ({
  usePlaidLink: (config) => {
    plaid.config = config
    return { open: plaid.open, ready: Boolean(config.token) }
  },
}))

const button = () => screen.getByRole('button')
const linkTokenCalls = () => api.mock.calls.filter(([path]) => path === '/api/plaid/link-token')

describe('LinkBank', () => {
  beforeEach(() => {
    api.mockReset()
    plaid.open.mockReset()
  })

  it('asks for nothing until clicked (the bug)', () => {
    const { rerender } = render(<LinkBank householdId="hh-1" onLinked={() => {}} onError={() => {}} />)
    rerender(<LinkBank householdId="hh-1" onLinked={() => {}} onError={() => {}} />)
    expect(api).not.toHaveBeenCalled()
    expect(button()).toBeEnabled()
    expect(button()).toHaveTextContent('Link a bank')
  })

  it('one click: one token, then Plaid opens', async () => {
    api.mockResolvedValueOnce({ link_token: 'link-sandbox-fake' })
    render(<LinkBank householdId="hh-1" onLinked={() => {}} onError={() => {}} />)
    await act(async () => fireEvent.click(button()))
    expect(linkTokenCalls()).toEqual([['/api/plaid/link-token', { method: 'POST', body: { household_id: 'hh-1' } }]])
    expect(plaid.open).toHaveBeenCalledTimes(1)
    expect(button()).toHaveTextContent('Opening…')
    expect(button()).toBeDisabled()
  })

  it('closing Plaid lets you try again', async () => {
    api.mockResolvedValue({ link_token: 'link-sandbox-fake' })
    render(<LinkBank householdId="hh-1" onLinked={() => {}} onError={() => {}} />)
    await act(async () => fireEvent.click(button()))
    act(() => plaid.config.onExit())
    expect(button()).toBeEnabled()
    expect(button()).toHaveTextContent('Link a bank')
    await act(async () => fireEvent.click(button()))
    expect(linkTokenCalls()).toHaveLength(2)
  })

  it('a successful link saves the bank', async () => {
    api.mockResolvedValueOnce({ link_token: 'link-sandbox-fake' }).mockResolvedValueOnce({})
    const onLinked = vi.fn()
    render(<LinkBank householdId="hh-1" onLinked={onLinked} onError={() => {}} />)
    await act(async () => fireEvent.click(button()))
    await act(async () => plaid.config.onSuccess('public-sandbox-fake'))
    expect(api).toHaveBeenLastCalledWith('/api/plaid/exchange', { method: 'POST', body: { household_id: 'hh-1', public_token: 'public-sandbox-fake' } })
    expect(onLinked).toHaveBeenCalled()
    expect(button()).toHaveTextContent('Link a bank')
  })

  it('explains the rate limit, and other failures', async () => {
    const onError = vi.fn()
    api.mockRejectedValueOnce(new Error('too_many_requests')).mockRejectedValueOnce(new Error('plaid_unavailable'))
    render(<LinkBank householdId="hh-1" onLinked={() => {}} onError={onError} />)
    await act(async () => fireEvent.click(button()))
    expect(onError).toHaveBeenLastCalledWith("You've tried a few times in a row. Wait a few minutes, then try again.")
    expect(button()).toBeEnabled()
    await act(async () => fireEvent.click(button()))
    expect(onError).toHaveBeenLastCalledWith("Bank linking isn't available right now.")
    expect(plaid.open).not.toHaveBeenCalled()
  })
})
