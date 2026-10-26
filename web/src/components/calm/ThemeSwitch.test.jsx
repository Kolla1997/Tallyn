import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ThemeSwitch from './ThemeSwitch.jsx'
import { currentTheme } from '../../lib/theme.js'

// Light and dark (#187): the sun and moon set the theme, put .dark on <html>, switch the token
// values, and remember the choice on this device.
describe('ThemeSwitch', () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('switches to dark and back, and remembers it', () => {
    render(<ThemeSwitch />)
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.style.getPropertyValue('--color-redesign-page')).toBe('#09090b')
    expect(currentTheme()).toBe('dark')
    fireEvent.click(screen.getByRole('button', { name: 'Light' }))
    expect(document.documentElement).not.toHaveClass('dark')
    expect(document.documentElement.style.getPropertyValue('--color-redesign-page')).toBe('#fafafa')
    expect(currentTheme()).toBe('light')
  })
})
