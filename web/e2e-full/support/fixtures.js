// `person(...)` makes a fresh test person and removes them after the test, so
// no test depends on another and nothing is left behind (#113).
import { test as base, expect } from '@playwright/test'
import { freshCode } from './totp.js'
import { createPerson, removePerson } from './users.js'

export const test = base.extend({
  // eslint-disable-next-line no-empty-pattern
  person: async ({}, provide) => {
    const made = []
    await provide(async (opts) => {
      const p = await createPerson(opts)
      made.push(p)
      return p
    })
    for (const p of made) await removePerson(p)
  },
})

export { expect }

// Signs in through the page with the password and a 2FA code, as a person does.
// The app always lands on Home after signing in, so `path` is opened afterwards.
export async function signIn(page, person, { path = '/' } = {}) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await page.getByLabel('Email').fill(person.email)
  await page.getByLabel('Password', { exact: true }).fill(person.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible()
  await page.getByLabel('Digit 1 of 6').fill(await freshCode(person.secret)) // fills all six boxes
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeHidden()
  if (path !== '/') await page.goto(path)
}
