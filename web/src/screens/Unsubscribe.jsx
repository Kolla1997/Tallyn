import { useEffect, useState } from 'react'
import Heading from '../components/Heading.jsx'

// Unsubscribe from an email (#269, Dinesh picked page A in drafts/269-notification-emails.html):
// no sign-in, one question, one button. Opening the link changes nothing (mail scanners open links
// on their own); the button does. The page never shows account data, only which email it stops.

const WHAT = {
  reconnect: { name: 'reconnect emails', still: 'You’ll still see banks to reconnect in the app.' },
  payment_due: { name: 'payment-due emails', still: 'You’ll still see payments due in the app.' },
  kid_reconnect: { name: 'emails about your child’s bank', still: 'You’ll still see them in the app.' },
  weekly: { name: 'weekly summaries', still: 'Your week is still on Home and in Transactions.' },
  monthly: { name: 'monthly highlights', still: 'Your month is still on Home and in Transactions.' },
  news: { name: 'product news', still: 'You’ll still get alerts, summaries and account emails.' }, // #281
}

async function call(token, body) {
  const res = await fetch(`/api/email/unsubscribe?t=${encodeURIComponent(token)}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'failed'), { code: data.error, status: res.status })
  return data
}

export default function Unsubscribe() {
  const token = new URLSearchParams(window.location.search).get('t') ?? ''
  const [kind, setKind] = useState(null)
  const [state, setState] = useState('loading') // loading, ask, saving, done, bad, error
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    call(token)
      .then((d) => live && (setKind(d.kind), setState('ask')))
      .catch(() => live && setState('bad'))
    return () => {
      live = false
    }
  }, [token])

  async function change(on) {
    setState('saving')
    setErr('')
    try {
      await call(token, { on })
      setState(on ? 'ask' : 'done')
    } catch (e) {
      if (e.status === 410) return setState('bad')
      setState(on ? 'done' : 'ask')
      setErr("We couldn't change that. Try again in a moment.")
    }
  }

  const what = WHAT[kind] ?? WHAT.reconnect
  if (state === 'loading') return <section className="card calm-card" aria-busy="true" />
  if (state === 'bad')
    return (
      <section className="card calm-card">
        <Heading>This link doesn’t work</Heading>
        <p className="muted">It may be from an old email. You can turn emails off in Settings → Notifications after signing in.</p>
        <div className="card-links">
          <a href="/">Sign in</a>
        </div>
      </section>
    )
  if (state === 'done')
    return (
      <section className="card calm-card text-center">
        <svg className="unsub-tick mx-auto mb-3 size-11" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
        <Heading>Done. No more {what.name}.</Heading>
        <p className="muted" role="status">
          {what.still}
        </p>
        {err && (
          <p className="error" role="alert">
            {err}
          </p>
        )}
        <div className="card-links">
          <button className="link-quiet" onClick={() => change(true)}>
            Turn it back on
          </button>
          <a href="/settings">Change in Settings</a>
        </div>
      </section>
    )
  return (
    <section className="card calm-card text-center">
      <Heading>Stop {what.name}?</Heading>
      <p className="muted">{what.still}</p>
      {err && (
        <p className="error" role="alert">
          {err}
        </p>
      )}
      <button className="btn" type="button" onClick={() => change(false)} disabled={state === 'saving'}>
        {state === 'saving' ? 'Turning it off…' : 'Stop these emails'}
      </button>
      <div className="card-links">
        <a href="/">Keep getting them</a>
      </div>
    </section>
  )
}
