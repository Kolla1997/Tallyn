import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { currentVersions, rememberAgreement } from '../lib/legal.js'
import { callsTo, routeApi } from '../test/fakeApi.js'
import ConsentGate from './ConsentGate.jsx'

// Agreeing to the Terms and Privacy Policy (#36, #114).
const api = vi.fn()
vi.mock('../lib/api.js', () => ({ api: (...a) => api(...a) }))

async function open(needed, post = null) {
  routeApi(api, [['/api/consent', (p, o) => (o?.method === 'POST' ? post : { needed })]])
  await act(async () =>
    render(
      <ConsentGate onSignOut={() => {}}>
        <p>Home</p>
      </ConsentGate>,
    ),
  )
}

describe('ConsentGate', () => {
  beforeEach(() => {
    api.mockReset()
    localStorage.clear()
  })

  // While checking, only the loader: no logo or footer (#1, Dinesh picked B).
  it('checking: only the loader, no footer', () => {
    api.mockReturnValue(new Promise(() => {}))
    const { container } = render(
      <ConsentGate onSignOut={() => {}}>
        <p>Home</p>
      </ConsentGate>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Adding it all up')
    expect(container.querySelector('footer')).toBeNull()
    expect(screen.queryByRole('img', { name: 'Coinroof' })).toBeNull()
  })

  it('already agreed: straight in', async () => {
    await open(false)
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('new versions: asks, waits for the tick, records the current versions', async () => {
    await open(true)
    expect(screen.getByRole('heading', { name: 'Before you start' })).toBeInTheDocument()
    const card = screen.getByRole('heading', { name: 'Before you start' }).closest('section')
    expect(within(card).getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('target', '_blank')
    expect(within(card).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('target', '_blank')
    const go = screen.getByRole('button', { name: 'Continue' })
    expect(go).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /I agree/ }))
    await act(async () => fireEvent.click(go))
    expect(callsTo(api, '/api/consent', 'POST')[0][1].body).toEqual(currentVersions())
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('ticked "I agree" at sign-up on this device: recorded without asking twice', async () => {
    rememberAgreement()
    await open(true)
    expect(callsTo(api, '/api/consent', 'POST')).toHaveLength(1)
    expect(screen.getByText('Home')).toBeInTheDocument()
  })

  it('documents changed while reading: says to reload', async () => {
    await open(true, new Error('version_changed'))
    fireEvent.click(screen.getByRole('checkbox', { name: /I agree/ }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Continue' })))
    expect(screen.getByRole('alert')).toHaveTextContent('The documents were just updated.')
    expect(screen.queryByText('Home')).toBeNull()
  })

  it('can’t check: offers to try again or sign out, never lets you in', async () => {
    routeApi(api, [['/api/consent', new Error('internal')]])
    await act(async () =>
      render(
        <ConsentGate onSignOut={() => {}}>
          <p>Home</p>
        </ConsentGate>,
      ),
    )
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.queryByText('Home')).toBeNull()
  })
})
