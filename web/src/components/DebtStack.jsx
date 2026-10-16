import { useState } from 'react'
import { formatMoney } from '../lib/money.js'
import { accountKind } from './AccountIcon.jsx'

// A person's credit cards and debts as a stack of cards (#39), in flat brand
// colours (no gradients or shadows, Design System). Click or press Enter on a
// card to bring it to the front. Only the last four digits are ever shown:
// that's all Plaid gives us, and all Tallyn should show. The list under the
// stack carries the same facts for screen readers and quick scanning.

// Colours with enough contrast for small text (Clay and Sage alone don't).
const TONES = ['debt-clay', 'debt-cocoa', 'debt-sage', 'debt-sand']
const KIND = { card: 'Credit card', home: 'Home loan', student: 'Student loan', auto: 'Auto loan', loan: 'Loan' }
const ICON = {
  card: 'M3 6.5h18v11H3zM3 10.5h18M7 15h3',
  home: 'M4 10.5 12 4l8 6.5V20h-5v-5h-6v5H4z',
  student: 'M2 9l10-5 10 5-10 5zM6 11v5c2 2 10 2 12 0v-5',
  auto: 'M5 16V11l2-5h10l2 5v5M5 16h14M5 16v2M19 16v2M7.5 13.5h.01M16.5 13.5h.01',
  loan: 'M3 9 12 4l9 5M5 9v9M10 9v9M14 9v9M19 9v9M3 20h18',
}
const PEEK = 34 // px of each card showing behind the next

export default function DebtStack({ title, accounts, home }) {
  // Credit cards first, then loans; biggest first within each.
  const sorted = [...accounts].sort(
    (x, y) => (accountKind(x) === 'card' ? 0 : 1) - (accountKind(y) === 'card' ? 0 : 1) || (y.current_balance_minor ?? 0) - (x.current_balance_minor ?? 0),
  )
  const [front, setFront] = useState(null) // id of the card brought forward
  const order = front ? [...sorted.filter((a) => a.id !== front), sorted.find((a) => a.id === front)] : sorted
  const counted = accounts.filter((a) => a.currency === home && a.current_balance_minor != null)
  const total = counted.reduce((t, a) => t + a.current_balance_minor, 0)
  const cards = sorted.filter((a) => accountKind(a) === 'card')
  const loans = sorted.filter((a) => accountKind(a) !== 'card')
  const banks = [...new Set(accounts.map((a) => a.bankName).filter(Boolean))]

  return (
    <section className="panel debt-stack" aria-labelledby="debts-h">
      <div className="panel-head">
        {/* The badge is for the eye; screen readers hear the count in words (#1). */}
        <h2 id="debts-h" aria-label={`${title} (${accounts.length} ${accounts.length === 1 ? 'card or loan' : 'cards and loans'})`}>
          {title}
          <span className="debt-count" aria-hidden="true">
            {accounts.length}
          </span>
        </h2>
        {accounts.length > 0 && <span className="amount money-out">{formatMoney(total, home)}</span>}
      </div>
      {accounts.length === 0 ? (
        <p className="small muted">No credit cards or loans.</p>
      ) : (
        <>
          <p className="small muted debt-sub">owed in total{banks.length > 0 && ` · ${banks.join(', ')}`}</p>
          <div className="debt-cards" style={{ height: PEEK * (order.length - 1) + 150 }} aria-hidden="true">
            {order.map((a, pos) => {
              const kind = accountKind(a)
              const tone = TONES[sorted.indexOf(a) % TONES.length]
              return (
                <button
                  key={a.id}
                  type="button"
                  tabIndex={-1}
                  className={`debt-card ${tone}`}
                  style={{ top: pos * PEEK, zIndex: pos }}
                  onClick={() => setFront(a.id)}
                >
                  <span className="debt-card-top">
                    <span className="debt-card-name">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        focusable="false"
                      >
                        <path d={ICON[kind]} />
                      </svg>
                      {a.name}
                    </span>
                    {a.mask && <span>•• {a.mask}</span>}
                  </span>
                  <span>
                    <span className="debt-card-kind">{KIND[kind]} · owed</span>
                    <span className="debt-card-amount">{a.current_balance_minor == null ? '—' : formatMoney(a.current_balance_minor, a.currency)}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {[
            ['Credit cards', cards],
            ['Loans', loans],
          ].map(
            ([label, list]) =>
              list.length > 0 && (
                <div key={label} className="account-group">
                  <h3 className="account-group-head">
                    <span>{label}</span>
                    <span className="money-out">
                      {formatMoney(
                        list.filter((a) => a.currency === home && a.current_balance_minor != null).reduce((t, a) => t + a.current_balance_minor, 0),
                        home,
                      )}
                    </span>
                  </h3>
                  <ul className="debt-list">
                    {list.map((a) => (
                      <li key={a.id}>
                        <button type="button" className="debt-list-item" aria-pressed={front === a.id} onClick={() => setFront(a.id)}>
                          <span>
                            {a.name}
                            {a.mask && <span className="muted"> ••{a.mask}</span>}
                          </span>
                          <span className="amount money-out">{a.current_balance_minor == null ? '—' : formatMoney(a.current_balance_minor, a.currency)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
          )}
          <p className="small muted">Credit limits, interest rates and due dates come later.</p>
        </>
      )}
    </section>
  )
}

// The sharing rules in plain words, under the stack on Family.
export function HowSharingWorks() {
  return (
    <section className="panel how-sharing" aria-labelledby="how-h">
      <div className="panel-head">
        <h2 id="how-h">How sharing works</h2>
      </div>
      <ul className="small">
        <li>Nobody sees your money until you share it.</li>
        <li>Owners and adults see their teens&apos; and children&apos;s money.</li>
        <li>Time and location are only shared together with transactions.</li>
        <li>Viewers see only what people share with them.</li>
        <li>Changes take effect straight away, and you can undo them any time.</li>
      </ul>
    </section>
  )
}
