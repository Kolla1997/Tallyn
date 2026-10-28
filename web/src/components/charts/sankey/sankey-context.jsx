'use client'
import { createContext, useContext } from 'react'

const SankeyContext = createContext(null)

export function SankeyProvider({ children, value }) {
  return <SankeyContext.Provider value={value}>{children}</SankeyContext.Provider>
}

export function useSankey() {
  const context = useContext(SankeyContext)
  if (!context) {
    throw new Error('useSankey must be used within a SankeyProvider')
  }
  return context
}

// CSS variables for sankey theming
export const sankeyCssVars = {
  background: 'var(--chart-background)',
  foreground: 'var(--chart-foreground)',
  nodePrimary: 'var(--chart-line-primary)',
  nodeSecondary: 'var(--chart-line-secondary)',
  linkColor: 'var(--chart-foreground-muted, hsl(0, 0%, 50%))',
}
