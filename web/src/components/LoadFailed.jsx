import { useId } from 'react'
import mark from '../../../brand/logo/svg/tallyn-mark-light.svg'
import { RetryIcon } from './Icons.jsx'

// When a page can't load (#151, Dinesh picked D). Nothing on screen yet: a
// calm glass card with Try again, instead of a loader that never stops.
export default function LoadFailed({ what = 'your money', busy = false, onRetry }) {
  const id = useId()
  return (
    <section className="panel load-failed" aria-labelledby={id}>
      <img src={mark} alt="" width="56" height="56" />
      <h2 id={id}>We couldn&apos;t load {what}</h2>
      <p className="muted">Your accounts are safe. This is usually a connection hiccup, so it&apos;s worth another try.</p>
      <TryAgain busy={busy} onRetry={onRetry} />
    </section>
  )
}

// Money already on screen: keep it, and say it may be out of date.
export function StaleBanner({ what = 'your money', busy = false, onRetry }) {
  return (
    <div className="stale-banner" role="alert">
      <p>We couldn&apos;t update {what} just now. You&apos;re seeing what we had a moment ago.</p>
      <button type="button" className="link" onClick={onRetry} disabled={busy}>
        {busy ? 'Trying again…' : 'Try again'}
      </button>
    </div>
  )
}

// The button on its own, for sign-in steps (#151 D3, D4). While it retries it
// waits in sand, like the 2FA button (#108).
export function TryAgain({ busy = false, onRetry }) {
  return (
    <button type="button" className={`btn btn-icon-text${busy ? ' btn-waiting' : ''}`} onClick={onRetry} disabled={busy}>
      {busy ? (
        'Trying again…'
      ) : (
        <>
          <RetryIcon />
          Try again
        </>
      )}
    </button>
  )
}
