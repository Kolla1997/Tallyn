import { useEffect, useRef } from 'react'
import logo from '../../../brand/coinroof/logo/svg/coinroof-lockup-plain-light.svg'
import logoDark from '../../../brand/coinroof/logo/svg/coinroof-lockup-plain-dark.svg'
import ThemeSwitch from './calm/ThemeSwitch.jsx'
import LaunchVideo from './LaunchVideo.jsx'
import { SiteFooter } from './AuthPage.jsx'

// The signed-out page (#220, Dinesh picked C): the headline across the top, then the product video
// and the auth card side by side on one level. Every auth screen (sign in, create an account, the 2FA
// code, reset) opens in that same card slot. Below: About, what it does, safety, a closing call.
// On a phone the card comes first, then the headline and video. Sections rise in once as they
// scroll into view (loading-effect rule, #228); reduced motion shows them at once.

// Tells the sign-in card to switch to "create an account" (the closing call's button).
export const SIGN_UP_EVENT = 'coinroof:sign-up'

const FEATURES = [
  ['One total, any currency', 'Every account, converted to your home currency, added up in one place.', 'globe'],
  ['Spending and savings', 'Budgets and goals that update as your bank does, so you see how the month is going.', 'bars'],
  ['Shared, on your terms', 'Partners, kids and parents see only what you choose to share.', 'people'],
]
const SAFETY = [
  "Coinroof can't move money. Payments and transfers stay in your bank's app.",
  'Nobody sees your money until you share it.',
  "Your bank connections are encrypted before they're stored.",
  'Two-step sign-in keeps your account yours.',
]

function Icon({ name }) {
  const paths = {
    globe: 'M4 12h16M12 4a12 12 0 0 1 0 16M12 4a12 12 0 0 0 0 16',
    bars: 'M4 18V9M10 18V5M16 18v-6M22 18H2',
    people: 'M3 19c0-3 3-5 6-5s6 2 6 5M14 19c0-2 2-3.5 4-3.5s3 1 3 3',
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      {name === 'globe' && <circle cx="12" cy="12" r="8" />}
      {name === 'people' && (
        <>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
        </>
      )}
      <path d={paths[name]} />
    </svg>
  )
}

// Adds `.in` to each `.launch-rise` once it scrolls into view.
function useRise() {
  const root = useRef(null)
  useEffect(() => {
    const els = root.current?.querySelectorAll('.launch-rise') ?? []
    if (typeof IntersectionObserver === 'undefined') {
      els.forEach((e) => e.classList.add('in'))
      return
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        }),
      { threshold: 0.15 },
    )
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [])
  return root
}

// When the card in the slot changes height (sign in to create an account), it grows or shrinks
// smoothly instead of jumping (#220). The card sits on its own layer on wide screens, so this
// moves nothing else on the page. Reduced motion jumps.
function useSmoothCard() {
  const slot = useRef(null)
  useEffect(() => {
    const el = slot.current
    if (!el || typeof MutationObserver === 'undefined') return
    const card = () => el.querySelector('.card')
    let prev = card()?.getBoundingClientRect().height ?? 0 // the card's settled height
    let frame = 0
    // After the card's content changes, measure its new natural height and ease from where it was.
    const settle = () => {
      frame = 0
      const c = card()
      if (!c) return
      const shown = c.getAnimations().length ? c.getBoundingClientRect().height : prev
      c.getAnimations().forEach((a) => a.cancel())
      const next = c.getBoundingClientRect().height
      const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (shown && Math.abs(next - shown) > 2 && !still && c.animate) {
        c.style.overflow = 'hidden'
        const run = c.animate([{ height: `${shown}px` }, { height: `${next}px` }], {
          duration: 320,
          easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
        })
        run.onfinish = () => (c.style.overflow = '')
      }
      prev = next
    }
    const mo = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(settle)
    })
    mo.observe(el, { childList: true, subtree: true, characterData: true })
    return () => {
      mo.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [])
  return slot
}

export default function LaunchPage({ children }) {
  const root = useRise()
  const slot = useSmoothCard()
  // Footer links from other pages land here with a #section.
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView()
  }, [])
  const signUp = () => {
    window.dispatchEvent(new Event(SIGN_UP_EVENT))
    document.getElementById('auth-slot')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  return (
    <main ref={root} className="page calm-page calm-auth launch">
      <ThemeSwitch className="fixed top-4 right-4 z-10" />
      <div className="launch-hero">
        <img className="logo launch-logo dark:hidden" src={logo} alt="Coinroof" />
        <img className="logo launch-logo hidden dark:block" src={logoDark} alt="Coinroof" />
        <div className="launch-pitch launch-rise" style={{ '--d': '120ms' }}>
          <h1>All your family&apos;s money, in every currency.</h1>
          <p>Link your banks and cards, see one total in your home currency, and share what you choose with the people you love.</p>
        </div>
        {/* TODO(#220): swap the demo for the real product video once it exists. */}
        <LaunchVideo />
        <div ref={slot} id="auth-slot" className="launch-slot launch-rise" style={{ '--d': '60ms' }}>
          {children}
        </div>
      </div>

      <section className="launch-section" aria-labelledby="about-h">
        <h2 id="about-h" className="launch-rise">
          About Coinroof
        </h2>
        <p className="launch-lead launch-rise" style={{ '--d': '90ms' }}>
          Coinroof is a family finance app. Families connect bank accounts and cards in any currency, see one total in their home currency, and keep track of
          spending and savings together, with partners, kids and parents.
        </p>
        <div id="features-h" className="launch-features">
          {FEATURES.map(([title, text, icon], i) => (
            <article key={title} className="calm-glass launch-feature launch-rise" style={{ '--d': `${i * 90}ms` }}>
              <span className="launch-icon">
                <Icon name={icon} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="launch-section calm-glass launch-safe" aria-labelledby="safe-h">
        <h2 id="safe-h" className="launch-rise">
          Your money stays yours
        </h2>
        <ul>
          {SAFETY.map((s, i) => (
            <li key={s} className="launch-rise" style={{ '--d': `${i * 90}ms` }}>
              {s}
            </li>
          ))}
        </ul>
      </section>

      <section className="launch-section calm-glass launch-cta launch-rise" aria-labelledby="cta-h">
        <h2 id="cta-h">Ready to see it all add up?</h2>
        <button type="button" className="btn" onClick={signUp}>
          Create an account
        </button>
      </section>

      <SiteFooter onSignUp={signUp} />
    </main>
  )
}
