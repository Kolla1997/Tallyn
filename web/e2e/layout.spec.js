import { expect, test } from '@playwright/test'
import { prepare } from './fixtures.js'

// Layout checks (#117): at phone (375), laptop (1024) and desktop (1440)
// width, every page must not scroll sideways, must not show an error, and
// its key parts must really be visible: on screen, with size, and not
// hidden by display, visibility or opacity anywhere above them. Catches the
// kind of bugs in #94 (a legend hidden by CSS) and #97 (the phone layout).

async function reallyVisible(locator, what) {
  await expect(locator, what).toBeVisible()
  await locator.scrollIntoViewIfNeeded()
  const r = await locator.evaluate((el) => {
    let opacity = 1
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.display === 'none' || s.visibility === 'hidden') return { hidden: true }
      opacity *= parseFloat(s.opacity)
    }
    const b = el.getBoundingClientRect()
    return { hidden: false, opacity, w: b.width, h: b.height, left: b.left, right: b.right, vw: window.innerWidth }
  })
  expect(r.hidden, `${what}: hidden by CSS`).toBe(false)
  expect(r.opacity, `${what}: transparent`).toBeGreaterThan(0.1)
  expect(r.w * r.h, `${what}: no size`).toBeGreaterThan(0)
  expect(r.left, `${what}: off the left edge`).toBeGreaterThanOrEqual(-1)
  expect(r.right, `${what}: off the right edge`).toBeLessThanOrEqual(r.vw + 1)
}

async function noSidewaysScroll(page) {
  const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }))
  expect(scroll, 'the page scrolls sideways').toBeLessThanOrEqual(width)
}

async function noError(page) {
  await expect(page.getByRole('alert'), 'an error is showing').toHaveCount(0)
}

const isPhone = (testInfo) => testInfo.project.name === 'phone'

// Signed in: each page, and the parts that must show on it.
const month = new Date().toLocaleDateString('en-US', { month: 'long' })
const PAGES = [
  [
    'Home',
    '/',
    (p) => [
      p.getByRole('region', { name: 'Your balance' }),
      p.getByRole('region', { name: 'Your accounts' }),
      p.getByRole('region', { name: `Your spending in ${month}` }),
      p.getByRole('region', { name: 'Family' }),
    ],
  ],
  [
    'Accounts',
    '/accounts',
    (p) => [
      p.getByRole('region', { name: 'Net worth' }),
      p.getByRole('region', { name: /^You have/ }),
      p.getByRole('region', { name: /^You owe/ }),
      p.getByRole('region', { name: 'Connected banks' }),
    ],
  ],
  [
    'Transactions',
    '/transactions',
    (p) => [p.getByRole('list', { name: /categories/i }), p.getByRole('group', { name: /Your spending by day/ }), p.getByText('Corner Cafe').first()],
  ],
  [
    'Budgets',
    '/budgets',
    (p) => [
      p.getByRole('heading', { name: /on track this month|need a look/ }),
      p.getByRole('region', { name: 'Household budgets' }),
      p.getByRole('region', { name: 'Budgets for one person' }),
      p.getByText('Count my spending in household budgets'),
    ],
  ],
  ['Debts', '/debts', (p) => [p.getByRole('region', { name: 'What you owe by kind' }), p.getByRole('region', { name: 'Payments, interest and overdue' })]],
  ['Family', '/family', (p) => [p.getByRole('region', { name: 'People in your household' }), p.getByRole('heading', { name: 'Pat Example', exact: true })]],
  ['Goals', '/goals', (p) => [p.getByText('Savings goals are on the way')]],
  ...[
    ['profile', 'Profile'],
    ['security', 'Sign-in and security'],
    ['household', 'Household'],
    ['data', 'Your data'],
    ['notifications', 'Notifications'],
    ['legal', 'Legal'],
    ['leave', 'Leave or close'],
  ].map(([key, title]) => [`Settings · ${title}`, `/settings?section=${key}`, (p) => [p.getByRole('heading', { name: title, level: 2 })]]),
]

test.describe('signed in', () => {
  for (const [name, path, parts] of PAGES) {
    test(name, async ({ page }, testInfo) => {
      await prepare(page, 'aal2')
      await page.goto(path)
      const must = parts(page)
      await expect(must[0], `${name} didn't load`).toBeVisible({ timeout: 15_000 })
      for (const [i, part] of must.entries()) await reallyVisible(part, `${name}, part ${i + 1}`)
      // The menu: the sidebar on laptops and desktops, the tab bar on phones.
      if (isPhone(testInfo)) await reallyVisible(page.locator('nav.tabbar'), 'tab bar')
      else await reallyVisible(page.locator('#sidebar'), 'sidebar')
      await noError(page)
      await noSidewaysScroll(page)
    })
  }

  test('menus: Terms and Privacy are reachable', async ({ page }, testInfo) => {
    await prepare(page, 'aal2')
    await page.goto('/')
    await expect(page.getByRole('region', { name: 'Your balance' })).toBeVisible({ timeout: 15_000 })
    const menu = isPhone(testInfo)
      ? (await page.getByRole('button', { name: 'Menu' }).click(), page.getByRole('menu', { name: 'More' }))
      : (await page.locator('.profile-card').click(), page.getByRole('menu', { name: 'Your account' }))
    await reallyVisible(menu, 'menu')
    await reallyVisible(menu.getByRole('menuitem', { name: 'Terms of Service' }), 'Terms in the menu')
    await reallyVisible(menu.getByRole('menuitem', { name: 'Privacy Policy' }), 'Privacy in the menu')
    await noSidewaysScroll(page)
  })
})

test.describe('signed out', () => {
  test('sign in, and forgot password', async ({ page }) => {
    await prepare(page, null)
    await page.goto('/')
    await reallyVisible(page.getByRole('heading', { name: 'Welcome back' }), 'sign-in heading')
    await reallyVisible(page.getByLabel('Password'), 'password field')
    await reallyVisible(page.getByRole('link', { name: 'Terms of Service' }), 'footer Terms')
    await noSidewaysScroll(page)
    await page.getByRole('button', { name: 'Forgot password?' }).click()
    await reallyVisible(page.getByRole('heading', { name: 'Reset your password' }), 'reset heading')
    await noSidewaysScroll(page)
  })

  test('the 2FA code', async ({ page }) => {
    await prepare(page, 'aal1')
    await page.goto('/')
    await reallyVisible(page.getByRole('heading', { name: 'Enter your code' }), 'code heading')
    await reallyVisible(page.getByRole('textbox', { name: 'Digit 6 of 6' }), 'sixth code box')
    await page.getByRole('button', { name: "Can't get a code?" }).click()
    await reallyVisible(page.getByRole('button', { name: 'Use a backup code' }), 'backup code button')
    await noSidewaysScroll(page)
  })

  for (const [path, title] of [
    ['/terms', 'Terms of Service'],
    ['/privacy', 'Privacy Policy'],
  ]) {
    test(title, async ({ page }) => {
      await prepare(page, null)
      await page.goto(path)
      await reallyVisible(page.getByRole('heading', { name: title, level: 1 }), `${title} heading`)
      await noSidewaysScroll(page)
    })
  }
})
