import { useSyncExternalStore } from 'react'
import { applyTokens } from './tokens.js'

// Light and dark (#187, the #185 drafts' sun and moon). Your choice is kept on this device; until
// you choose, Tallyn follows the device's setting. The theme is a `dark` class on <html> (the
// `dark:` variants in app.css) plus the token values for that theme.
const KEY = 'tallyn.theme'
const listeners = new Set()

function saved() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

const system = () => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')

export const currentTheme = () => saved() ?? system()

function apply(theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  applyTokens(root, theme)
  listeners.forEach((l) => l())
}

export function startTheme() {
  apply(currentTheme())
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => !saved() && apply(system()))
}

export function setTheme(theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // storage blocked: the choice lasts until the page reloads
  }
  apply(theme)
}

const subscribe = (l) => (listeners.add(l), () => listeners.delete(l))
export const useTheme = () => useSyncExternalStore(subscribe, () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'))
