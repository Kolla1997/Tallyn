import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CreateHousehold from './CreateHousehold.jsx'

// US only for now (#287, Dinesh picked C): no currency to choose, every new household is USD.
const api = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a) }))

describe('CreateHousehold', () => {
  it('has no currency choice and creates the household in US dollars', async () => {
    api.mockResolvedValue({})
    const onCreated = vi.fn()
    render(<CreateHousehold onCreated={onCreated} />)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByText(/currency/i)).toBeNull()
    fireEvent.change(screen.getByLabelText('Household name'), { target: { value: ' The Rivera family ' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create household' })))
    expect(api).toHaveBeenCalledWith('/api/households', { method: 'POST', body: { name: 'The Rivera family', home_currency: 'USD' } })
    expect(onCreated).toHaveBeenCalled()
  })
})
