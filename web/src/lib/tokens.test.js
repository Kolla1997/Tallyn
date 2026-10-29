import { describe, expect, it } from 'vitest'
import tokens from '../../../design-tokens.json'
import { applyTokens } from './tokens.js'

// Coinroof colours (#201): the app's red and green are the logo's, and money text stays readable (AA, 4.5:1).
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const color = (name, theme) => {
  const t = tokens.color[name]
  return theme === 'dark' && t.dark ? t.dark : t.value
}

describe('Coinroof colours', () => {
  it('uses the logo red and green', () => {
    const root = document.createElement('div')
    applyTokens(root, 'light')
    expect(root.style.getPropertyValue('--color-redesign-button')).toBe('#CB0900')
    expect(root.style.getPropertyValue('--color-redesign-accent')).toBe('#CB0900')
    expect(root.style.getPropertyValue('--color-redesign-in')).toBe('#067B00')
  })

  it('switches money text to the lighter dark-mode values', () => {
    const root = document.createElement('div')
    applyTokens(root, 'dark')
    expect(root.style.getPropertyValue('--color-redesign-owe-text')).toBe('#E06B66')
    expect(root.style.getPropertyValue('--color-redesign-in-text')).toBe('#6AB066')
  })

  it('keeps money text and button text at AA contrast in both themes', () => {
    // Light: on white cards and the page. Dark: on the darkest card (#18181b) and the page.
    for (const bg of ['#FFFFFF', color('redesign-page', 'light')]) {
      expect(contrast(color('redesign-owe-text', 'light'), bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(color('redesign-in-text', 'light'), bg)).toBeGreaterThanOrEqual(4.5)
    }
    for (const bg of ['#18181B', color('redesign-page', 'dark')]) {
      expect(contrast(color('redesign-owe-text', 'dark'), bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(color('redesign-in-text', 'dark'), bg)).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrast('#FFFFFF', color('redesign-button', 'light'))).toBeGreaterThanOrEqual(4.5)
  })
})
