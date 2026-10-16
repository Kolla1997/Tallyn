import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Shell from './Shell.jsx'

// The tidier sidebar (#122, Dinesh picked P, A and M2): no footer in the
// signed-in app, and Terms and Privacy in the profile and ☰ menus, opening in
// a new tab. (Sizes are checked in the browser: jsdom has no layout.)
const me = { display_name: '11D11K' }
const household = { id: 'hh-1', name: 'Dkolla', role: 'owner' }

function renderShell() {
  return render(
    <Shell me={me} household={household} households={[household]} onChooseHousehold={() => {}} onSignOut={() => {}}>
      <p>Page</p>
    </Shell>,
  )
}

const legalIn = (menu) => ({
  terms: within(menu).getByRole('menuitem', { name: 'Terms of Service' }),
  privacy: within(menu).getByRole('menuitem', { name: 'Privacy Policy' }),
})

describe('Shell', () => {
  it('has no footer', () => {
    const { container } = renderShell()
    expect(container.querySelector('.site-footer')).toBeNull()
    expect(screen.queryByText(/It all adds up/)).toBeNull()
  })

  it('profile menu: Sign out, then Terms and Privacy in a new tab', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: /11D11K/ }))
    const menu = screen.getByRole('menu', { name: 'Your account' })
    const { terms, privacy } = legalIn(menu)
    expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
    expect(terms).toHaveAttribute('href', '/terms')
    expect(privacy).toHaveAttribute('href', '/privacy')
    for (const a of [terms, privacy]) {
      expect(a).toHaveAttribute('target', '_blank')
      expect(a).toHaveAttribute('rel', 'noopener')
    }
    // Arrow keys reach them.
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(terms)
  })

  it('phone ☰ menu has them too', () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    const { terms, privacy } = legalIn(screen.getByRole('menu', { name: 'More' }))
    expect(terms).toHaveAttribute('href', '/terms')
    expect(privacy).toHaveAttribute('href', '/privacy')
  })

  it('the collapse button keeps its name', () => {
    renderShell()
    expect(screen.getByRole('button', { name: /Collapse sidebar|Expand sidebar/ })).toBeInTheDocument()
  })
})
