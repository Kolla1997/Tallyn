import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ThemeSwitch from './ThemeSwitch.jsx'
import { currentTheme } from '../../lib/theme.js'

// Light and dark (#187): one button swaps the theme, put .dark on <html>, switch the token
// values, and remember the choice on this device.
describe('ThemeSwitch', () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('switches to dark and back, and remembers it', () => {
    render(<ThemeSwitch />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(document.documentElement.style.getPropertyValue('--color-redesign-page')).toBe('#09090b')
    expect(currentTheme()).toBe('dark')
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }))
    expect(document.documentElement).not.toHaveClass('dark')
    expect(document.documentElement.style.getPropertyValue('--color-redesign-page')).toBe('#fafafa')
    expect(currentTheme()).toBe('light')
  })
})
