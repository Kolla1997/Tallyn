import { useRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import { useModal } from './modal.js'

beforeAll(() => {
  // jsdom has no showModal.
  HTMLDialogElement.prototype.showModal ??= function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function () {
    this.open = false
  }
})

function Dialog({ onClose }) {
  const ref = useRef(null)
  useModal(ref)
  return (
    <dialog ref={ref}>
      <button onClick={onClose}>Close</button>
    </dialog>
  )
}

function Page() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && <Dialog onClose={() => setOpen(false)} />}
    </>
  )
}

// Closing a dialog puts focus back on the button that opened it (#153).
describe('useModal', () => {
  it('returns focus to the opener', () => {
    render(<Page />)
    const opener = screen.getByRole('button', { name: 'Open' })
    opener.focus()
    fireEvent.click(opener)
    screen.getByRole('button', { name: 'Close', hidden: true }).focus()
    fireEvent.click(screen.getByRole('button', { name: 'Close', hidden: true }))
    expect(document.activeElement).toBe(opener)
  })
})
