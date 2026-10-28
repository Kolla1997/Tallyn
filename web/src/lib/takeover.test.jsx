import { act, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTakeover } from './takeover.js'

// Full-screen panels on phones (#153): focus moves in, the page behind goes
// quiet, and focus returns to the opener when the panel closes.
function Panel() {
  const panel = useRef(null)
  const heading = useRef(null)
  useTakeover(panel, heading)
  return (
    <section ref={panel}>
      <h2 ref={heading} tabIndex={-1}>
        Details
      </h2>
    </section>
  )
}
function Page() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <main>
        <button onClick={() => setOpen(!open)}>Coffee</button>
      </main>
      <aside>{open && <Panel />}</aside>
    </div>
  )
}
const phone = (matches) => vi.stubGlobal('matchMedia', () => ({ matches }))

describe('useTakeover', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('on phones: focus in, page behind inert, focus back on close', async () => {
    phone(true)
    render(<Page />)
    const row = screen.getByRole('button', { name: 'Coffee' })
    row.focus()
    await act(async () => fireEvent.click(row))
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Details' }))
    expect(document.querySelector('main')).toHaveAttribute('inert')
    await act(async () => fireEvent.click(row)) // closes (the test clicks through inert)
    expect(document.querySelector('main')).not.toHaveAttribute('inert')
    expect(document.activeElement).toBe(row)
  })

  it('beside the page (wide screens): changes nothing', async () => {
    phone(false)
    render(<Page />)
    const row = screen.getByRole('button', { name: 'Coffee' })
    row.focus()
    await act(async () => fireEvent.click(row))
    expect(document.activeElement).toBe(row)
    expect(document.querySelector('main')).not.toHaveAttribute('inert')
  })
})
