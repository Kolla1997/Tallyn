import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  // The calm redesign (#187): the rail starts collapsed without a saved choice; every page keeps
  // its name for screen readers and on hover; the choice is remembered.
  it('starts collapsed, keeps page names, and remembers opening', () => {
    localStorage.clear()
    renderShell()
    const sidebar = document.getElementById('sidebar')
    for (const name of ['Home', 'Accounts', 'Transactions', 'Budgets', 'Debts', 'Family', 'Goals', 'Settings']) {
      expect(within(sidebar).getByRole('link', { name })).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument()
    expect(localStorage.getItem('tallyn.sidebar')).toBe('expanded')
  })

  // Cheaper motion (#157): the page's padding changes in one step and the page slides from where it
  // was with a transform, never animating padding. jsdom has no layout, so the page's left is faked
  // from the main padding class.
  describe('page slide', () => {
    afterEach(() => vi.restoreAllMocks())

    function fakeLayout({ reduced }) {
      vi.spyOn(window, 'matchMedia').mockImplementation((q) => ({ matches: reduced && q.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
      const animate = vi.fn()
      HTMLElement.prototype.animate = animate
      HTMLElement.prototype.getAnimations = () => []
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        const wide = document.getElementById('main').className.includes('lg:pl-[240px]')
        return { left: wide ? 240 : 114, top: 0, width: 0, height: 0, right: 0, bottom: 0 }
      })
      return animate
    }

    it('slides the page with a transform, not padding', () => {
      localStorage.clear()
      const animate = fakeLayout({ reduced: false })
      renderShell()
      expect(document.getElementById('main').className).not.toMatch(/transition-\[padding\]/)
      fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
      expect(animate).toHaveBeenCalledTimes(1)
      expect(animate.mock.calls[0][0]).toEqual([{ transform: 'translateX(-126px)' }, { transform: 'none' }])
    })

    it('snaps with reduced motion', () => {
      localStorage.clear()
      const animate = fakeLayout({ reduced: true })
      renderShell()
      fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
      expect(animate).not.toHaveBeenCalled()
    })
  })
})
