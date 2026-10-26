import tokens from '../../../design-tokens.json'

// design-tokens.json is the source of truth for token values, so the app reads
// it directly and exposes each value as a CSS variable:
// --color-clay-deep, --font-body, --radius-card, --space-s4, --glass-surface, ...
const fallback = {
  heading: 'system-ui, sans-serif',
  body: 'system-ui, sans-serif',
  button: 'system-ui, sans-serif',
}

// `theme`: 'light' or 'dark' (#187). Tokens with a `dark` value take it in the dark theme.
export function applyTokens(root = document.documentElement, theme = 'light') {
  const pick = (t) => (theme === 'dark' && t.dark ? t.dark : t.value)
  for (const [name, t] of Object.entries(tokens.color)) {
    root.style.setProperty(`--color-${name}`, pick(t))
  }
  for (const [name, { value }] of Object.entries(tokens.font)) {
    root.style.setProperty(`--font-${name}`, `'${value}', ${fallback[name] ?? 'sans-serif'}`)
  }
  for (const [name, { value }] of Object.entries(tokens.radius)) {
    root.style.setProperty(`--radius-${name}`, value)
  }
  for (const [name, { value }] of Object.entries(tokens.spacing)) {
    root.style.setProperty(`--space-${name}`, `${value}px`)
  }
  // Glass finish (#61): --glass-surface, --glass-blur, --glow-opacity, ...
  for (const [name, t] of Object.entries(tokens.effect ?? {})) {
    root.style.setProperty(`--${name}`, pick(t))
  }
}
