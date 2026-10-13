import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CodeForm from './CodeForm.jsx'

// The 2FA code field (#108): six boxes, checked at the 6th digit.
const verify = vi.fn()
vi.mock('../lib/supabase.js', () => ({ supabase: { auth: { mfa: { challengeAndVerify: (...a) => verify(...a) } } } }))

const boxes = () => screen.getAllByRole('textbox')
const values = () => boxes().map((b) => b.value)
const type = (i, v) => fireEvent.change(boxes()[i], { target: { value: v } })

describe('CodeForm', () => {
  beforeEach(() => {
    verify.mockReset()
    verify.mockResolvedValue({ error: null })
  })

  it('is six labelled boxes in a group, focused on the first, with phone autofill', () => {
    render(<CodeForm factorId="f1" button="Continue" />)
    expect(screen.getByRole('group', { name: '6-digit code' })).toBeInTheDocument()
    expect(boxes()).toHaveLength(6)
    expect(boxes()[0]).toHaveAccessibleName('Digit 1 of 6')
    expect(boxes()[0]).toHaveAttribute('autocomplete', 'one-time-code')
    expect(boxes()[0]).toHaveAttribute('inputmode', 'numeric')
    expect(document.activeElement).toBe(boxes()[0])
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  it('moves along as you type, ignores letters, and checks the code at the 6th digit', async () => {
    render(<CodeForm factorId="f1" button="Continue" />)
    type(0, '1')
    expect(document.activeElement).toBe(boxes()[1])
    type(1, 'x')
    expect(values()[1]).toBe('')
    '23456'.split('').forEach((d, i) => type(i + 1, d))
    expect(values()).toEqual(['1', '2', '3', '4', '5', '6'])
    await act(async () => {})
    expect(verify).toHaveBeenCalledTimes(1)
    expect(verify).toHaveBeenCalledWith({ factorId: 'f1', code: '123456' })
  })

  it('Backspace on an empty box clears the one before and goes back', () => {
    render(<CodeForm factorId="f1" button="Continue" />)
    type(0, '1')
    type(1, '2')
    act(() => boxes()[2].focus())
    fireEvent.keyDown(boxes()[2], { key: 'Backspace' })
    expect(values().slice(0, 3)).toEqual(['1', '', ''])
    expect(document.activeElement).toBe(boxes()[1])
  })

  it('paste and autofill fill all six boxes', async () => {
    const { unmount } = render(<CodeForm factorId="f1" button="Continue" />)
    fireEvent.paste(boxes()[0], { clipboardData: { getData: () => '123 456' } })
    expect(values()).toEqual(['1', '2', '3', '4', '5', '6'])
    await act(async () => {})
    expect(verify).toHaveBeenLastCalledWith({ factorId: 'f1', code: '123456' })
    unmount()
    render(<CodeForm factorId="f1" button="Continue" />)
    type(0, '654321') // autofill puts the whole code in the first box
    expect(values()).toEqual(['6', '5', '4', '3', '2', '1'])
    await act(async () => {})
    expect(verify).toHaveBeenLastCalledWith({ factorId: 'f1', code: '654321' })
  })

  it('a wrong code clears the boxes, says so, and starts again from the first', async () => {
    verify.mockResolvedValue({ error: new Error('Invalid TOTP code') })
    render(<CodeForm factorId="f1" button="Turn on 2FA" />)
    fireEvent.paste(boxes()[0], { clipboardData: { getData: () => '000000' } })
    await act(async () => {})
    expect(screen.getByRole('alert')).toHaveTextContent("That code didn't work.")
    expect(values()).toEqual(['', '', '', '', '', ''])
    expect(document.activeElement).toBe(boxes()[0])
    expect(screen.getByRole('button', { name: 'Turn on 2FA' })).toBeDisabled()
  })
})
