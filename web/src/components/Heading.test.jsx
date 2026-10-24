import { act, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import Heading, { resetHeading } from './Heading.jsx'

// Screen headings (#153): they name the browser tab and take focus when the
// screen changes, but not on the first screen after a page load.
describe('Heading', () => {
  beforeEach(() => resetHeading())

  it('names the tab and leaves focus alone on the first screen', () => {
    render(<Heading>Accounts</Heading>)
    expect(document.title).toBe('Accounts · Tallyn')
    expect(document.activeElement).toBe(document.body)
  })

  it('takes focus when you arrive on the next screen', () => {
    const { unmount } = render(<Heading>Home</Heading>)
    unmount()
    render(<Heading>Family</Heading>)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Family' }))
    expect(document.title).toBe('Family · Tallyn')
  })

  it('takes focus when the step changes in place, with its own tab name', () => {
    let swap
    function Steps() {
      const [step, setStep] = useState('Welcome back')
      swap = setStep
      return <Heading title={step === 'Welcome back' ? 'Sign in' : undefined}>{step}</Heading>
    }
    render(<Steps />)
    expect(document.title).toBe('Sign in · Tallyn')
    expect(document.activeElement).toBe(document.body)
    act(() => swap('Reset your password'))
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Reset your password' }))
    expect(document.title).toBe('Reset your password · Tallyn')
  })
})
