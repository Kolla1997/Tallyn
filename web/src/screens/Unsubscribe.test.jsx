import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Unsubscribe from './Unsubscribe.jsx'

// Unsubscribe page (#269): signed out, a button press stops the email. Made-up token.
let calls
beforeEach(() => {
  calls = []
  window.history.replaceState(null, '', '/unsubscribe?t=fake.token')
  globalThis.fetch = vi.fn((url, opts = {}) => {
    calls.push([opts.method ?? 'GET', url, opts.body])
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ kind: 'payment_due' }) })
  })
})
afterEach(() => vi.restoreAllMocks())

describe('Unsubscribe', () => {
  it('asks first, then stops the email, and can turn it back on', async () => {
    render(<Unsubscribe />)
    expect(await screen.findByRole('heading', { name: 'Stop payment-due emails?' })).toBeInTheDocument()
    expect(calls).toEqual([['GET', '/api/email/unsubscribe?t=fake.token', undefined]]) // opening changes nothing
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop these emails' })))
    expect(calls[1]).toEqual(['POST', '/api/email/unsubscribe?t=fake.token', '{"on":false}'])
    expect(screen.getByRole('heading', { name: 'Done. No more payment-due emails.' })).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Turn it back on' })))
    expect(calls[2][2]).toBe('{"on":true}')
  })

  it('names the weekly summary (#273)', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ kind: 'weekly' }) }))
    render(<Unsubscribe />)
    expect(await screen.findByRole('heading', { name: 'Stop weekly summaries?' })).toBeInTheDocument()
  })

  it('product news: says alerts and account emails still come (#281)', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ kind: 'news' }) }))
    render(<Unsubscribe />)
    expect(await screen.findByRole('heading', { name: 'Stop product news?' })).toBeInTheDocument()
    expect(screen.getByText('You’ll still get alerts, summaries and account emails.')).toBeInTheDocument()
  })

  it('says when a link does not work', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ error: 'bad_link' }) }))
    render(<Unsubscribe />)
    expect(await screen.findByRole('heading', { name: 'This link doesn’t work' })).toBeInTheDocument()
  })
})
