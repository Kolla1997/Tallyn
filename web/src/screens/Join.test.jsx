import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Join from './Join.jsx'

// Joining a household from an invite (#12). A network blip keeps the invite (#151).
const api = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a) }))
const clearInvite = vi.fn()
vi.mock('../lib/invite.js', () => ({ clearInvite: () => clearInvite() }))

const join = async () => {
  await act(async () => render(<Join token="fake-token" onJoined={vi.fn()} onDismiss={vi.fn()} />))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Join household' })))
}

describe('Join', () => {
  beforeEach(() => {
    api.mockReset()
    clearInvite.mockReset()
  })

  it('not reached: keeps the invite and offers Try again', async () => {
    api.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({ household_id: 'hh-1' })
    await join()
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't reach Coinroof just now. Your invite is still here.")
    expect(clearInvite).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })))
    expect(api).toHaveBeenCalledTimes(2)
    expect(clearInvite).toHaveBeenCalled()
  })

  it('refused by the server: the invite goes, as before', async () => {
    api.mockRejectedValueOnce(Object.assign(new Error('invite_invalid'), { status: 403 }))
    await join()
    expect(screen.getByRole('alert')).toHaveTextContent("This invite isn't valid for your account.")
    expect(clearInvite).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })
})
