import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import ConfirmDialog from './ConfirmDialog.jsx'

vi.mock('../lib/mfa.js', () => ({ verifiedAuthenticators: async () => [], verifyCode: async () => true }))

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close ??= function () {
    this.open = false
  }
})

const open = (name) =>
  render(
    <ConfirmDialog title="Remove?" action="Remove" typeToConfirm={name} onConfirm={() => {}} onClose={() => {}}>
      <p>Sure?</p>
    </ConfirmDialog>,
  )
const type = (v) => fireEvent.change(screen.getByRole('textbox', { hidden: true }), { target: { value: v } })
const button = () => screen.getByRole('button', { name: 'Remove', hidden: true })

// Type-to-confirm (#154): plain-text matching, and a blank name can't be confirmed with nothing.
describe('ConfirmDialog type-to-confirm', () => {
  it('matches however the name was typed', () => {
    open('José 🌟')
    type('josé   🌟')
    expect(button()).toBeEnabled()
  })
  it('asks for the action word when the name is blank', () => {
    open('   ')
    expect(button()).toBeDisabled()
    type('')
    expect(button()).toBeDisabled()
    type('remove')
    expect(button()).toBeEnabled()
  })
})
