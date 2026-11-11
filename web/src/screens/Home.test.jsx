import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Home from './Home.jsx'

// Straight after creating a household, its owner gets the monthly payments step once (#307).
const api = vi.fn()
const loadMe = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a) }))
vi.mock('../lib/me.js', () => ({ loadMe: (...a) => loadMe(...a) }))

describe('Home', () => {
  it('shows the monthly payments step after Create household', async () => {
    const me = { id: 'u1', email: 'maya.rivera@fastmail.com', households: [] }
    loadMe.mockResolvedValueOnce(me).mockResolvedValue({ ...me, households: [{ id: 'h1', name: 'The Rivera family', home_currency: 'USD', role: 'owner' }] })
    api.mockResolvedValue({})
    await act(async () => render(<Home email={me.email} onSignOut={() => {}} />))
    expect(screen.queryByText(/What do you pay every month/)).toBeNull()

    fireEvent.change(screen.getByLabelText('Household name'), { target: { value: 'The Rivera family' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create household' })))
    expect(screen.getByRole('heading', { name: "What do you pay every month that isn't in your bank feed?" })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeTruthy()
    expect(screen.queryByText('Create your household')).toBeNull()
  })
})
