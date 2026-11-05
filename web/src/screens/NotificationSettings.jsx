import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { fromMinor, toMinor } from '../lib/budgets.js'
import { formatMoney } from '../lib/money.js'
import { Avatar, nameOf } from '../lib/people.jsx'
import { Panel, MUTED } from '../components/calm/ui.jsx'

// Settings → Notifications (#268, Dinesh picked draft C in drafts/268-notification-settings.html):
// one row per alert with its amount in the row, an email switch only on the alerts that will email
// (#269), a sample alert that changes as you type, then who else hears. Agreed 2026-11-03: parents
// hear their kids' big purchases and banks to reconnect, never the other way; one switch shares all
// your alerts with one owner or adult, only for what you already share with them (0021).
// Email (#269, Dinesh picked Settings B in drafts/269-notification-emails.html): the reconnect and
// payment-due switches, and a dashed line under each child to get their reconnect emails too.

const NOTE = `m-0 text-[13px] ${MUTED}`
const CUR = 'USD' // US only for now (Vision)

function Toggle({ label, checked, disabled, onChange }) {
  return (
    <label className={`relative inline-flex shrink-0 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-5 w-9 rounded-full bg-zinc-300 dark:bg-zinc-600 transition-colors duration-150 peer-checked:bg-[var(--color-redesign-in)] peer-disabled:border peer-disabled:border-dashed peer-disabled:border-zinc-400 peer-disabled:bg-zinc-100 dark:peer-disabled:bg-zinc-800 peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-900 dark:peer-focus-visible:ring-white peer-focus-visible:ring-offset-2 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform after:duration-150 peer-checked:after:translate-x-4 motion-reduce:after:transition-none"
      />
    </label>
  )
}

// The amount, in dollars, saved when you leave the field or press Enter. Keyed by the saved
// amount, so a reload or a failed save resets the field.
function Amount({ label, minor, onSave, onTyping }) {
  const show = (m) => fromMinor(m, CUR).replace(/\.00$/, '')
  const [text, setText] = useState(show(minor))
  const [bad, setBad] = useState(false)
  const commit = () => {
    const m = toMinor(text, CUR)
    setBad(m === null)
    if (m !== null && m !== minor) onSave(m)
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[14px] border bg-white dark:bg-zinc-900 px-2 py-1 text-[14px] focus-within:ring-2 focus-within:ring-zinc-900 dark:focus-within:ring-white ${bad ? 'border-[var(--color-redesign-owe-text)]' : 'border-zinc-200 dark:border-zinc-700'}`}
    >
      $
      <input
        inputMode="decimal"
        aria-label={label}
        aria-invalid={bad || undefined}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onTyping?.(toMinor(e.target.value, CUR))
        }}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="w-16 border-0 bg-transparent p-0 font-semibold tabular-nums outline-none"
      />
    </span>
  )
}

function Row({ i, label, note, children }) {
  return (
    <li className="calm-row flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-1 last:pb-1" style={{ '--n': i }}>
      <span className="min-w-0 grow basis-56">
        <span className="block text-[14px] font-semibold">{label}</span>
        {note && <span className={`block ${NOTE}`}>{note}</span>}
      </span>
      {children}
    </li>
  )
}

const Rows = ({ children }) => <ul className="m-0 list-none divide-y divide-zinc-100 dark:divide-zinc-800 p-0">{children}</ul>
const Sub = ({ children }) => <h4 className={`mt-4 mb-1 text-[13px] font-medium ${MUTED}`}>{children}</h4>

function Email({ label, checked, onChange }) {
  return (
    <span className={`inline-flex items-center gap-2 text-[13px] ${MUTED}`}>
      Email <Toggle label={label} checked={checked} onChange={onChange} />
    </span>
  )
}

export default function NotificationSettings({ me, household }) {
  const [s, setS] = useState(null)
  const [members, setMembers] = useState([])
  const [status, setStatus] = useState('')
  const [sample, setSample] = useState(null) // the big purchase amount being typed
  const [pick, setPick] = useState(null) // the partner chosen while sharing is off
  const adult = household.role === 'owner' || household.role === 'adult'

  useEffect(() => {
    let live = true
    Promise.all([api(`/api/notifications/settings?household_id=${household.id}`), api(`/api/households/${household.id}/members`)])
      .then(([st, m]) => {
        if (!live) return
        setS(st)
        setMembers(m?.members ?? [])
      })
      .catch(() => live && setStatus("We couldn't load your notification settings. Try again in a moment."))
    return () => {
      live = false
    }
  }, [household.id])

  async function save(change) {
    // The weekly summary goes out at 9am in this time zone (#273).
    const next = { ...s, ...change, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || null }
    const before = s
    setS(next)
    setStatus('Saving…')
    try {
      await api(`/api/notifications/settings?household_id=${household.id}`, { method: 'PUT', body: next })
      setStatus('Saved')
    } catch {
      setS(before)
      setStatus("We couldn't save that. Try again in a moment.")
    }
  }

  const partners = members.filter((m) => m.user_id !== me.user_id && (m.role === 'owner' || m.role === 'adult'))
  const kids = members.filter((m) => m.role === 'teen' || m.role === 'child')
  const partner = partners.find((m) => m.user_id === (s?.share_with ?? pick)) ?? partners[0]
  const big = sample ?? s?.big_purchase_minor ?? 50000
  const kidEmails = s?.email_kid_reconnect ?? []

  return (
    <Panel id="notifications-h" title="Notifications">
      {!s ? (
        <p className={NOTE} role={status ? 'alert' : undefined}>
          {status || 'Adding it all up…'}
        </p>
      ) : (
        <>
          <Sub>In the app</Sub>
          <Rows>
            <Row i={0} label="Big purchase" note="A purchase over this amount.">
              <Toggle label="Big purchase alerts" checked={s.big_purchase} onChange={(v) => save({ big_purchase: v })} />
              <Amount
                key={s.big_purchase_minor}
                label="Big purchase amount"
                minor={s.big_purchase_minor}
                onTyping={setSample}
                onSave={(m) => {
                  setSample(null)
                  save({ big_purchase_minor: m })
                }}
              />
            </Row>
            <Row i={1} label="Low balance" note="A checking or savings account under this amount.">
              <Toggle label="Low balance alerts" checked={s.low_balance} onChange={(v) => save({ low_balance: v })} />
              <Amount key={s.low_balance_minor} label="Low balance amount" minor={s.low_balance_minor} onSave={(m) => save({ low_balance_minor: m })} />
            </Row>
            <Row i={2} label="A bank needs reconnecting" note="Always on in the app: we can't update it until you sign in.">
              <Email label="Email when a bank needs reconnecting" checked={s.email_reconnect} onChange={(v) => save({ email_reconnect: v })} />
            </Row>
            <Row i={3} label="Payment due soon" note="Always on in the app. Three days before a card or loan is due, and if it's overdue.">
              <Email label="Email when a payment is due" checked={s.email_payment_due} onChange={(v) => save({ email_payment_due: v })} />
            </Row>
            <Row i={4} label="Someone joins" note={`When someone joins ${household.name}.`}>
              <Toggle label="Someone joins alerts" checked={s.joined} onChange={(v) => save({ joined: v })} />
            </Row>
          </Rows>

          <Sub>Summaries by email</Sub>
          <Rows>
            <Row i={5} label="Weekly summary" note="Every Monday at 9am: last week's spending, what's coming up, and this month so far.">
              <Email label="Weekly summary email" checked={s.email_weekly ?? false} onChange={(v) => save({ email_weekly: v })} />
            </Row>
            <Row i={6} label="Monthly highlights" note="On the 1st at 9am: last month's highlights, day by day, and where it went.">
              <Email label="Monthly highlights email" checked={s.email_monthly ?? false} onChange={(v) => save({ email_monthly: v })} />
            </Row>
            {adult && (
              <Row i={7} label="Include what's shared with me" note="Spending others share with you in Family, and your children's totals.">
                <Toggle
                  label="Include what's shared with me in the summaries"
                  checked={s.email_include_shared ?? false}
                  disabled={!s.email_weekly && !s.email_monthly}
                  onChange={(v) => save({ email_include_shared: v })}
                />
              </Row>
            )}
          </Rows>

          {/* The alert as it would land, in the list's glass F (#267), changing as you type. */}
          <div className="notif-glass mt-3 rounded-[20px] p-2" aria-live="polite">
            <p className={`m-0 px-2 pb-1 text-[12px] ${MUTED}`}>How it will look</p>
            <p className="notif-chip m-0 p-2 text-[14px] text-[var(--ni-text)]">
              You spent <b className="font-semibold tabular-nums text-[var(--ni-ink)]">{formatMoney(big + 14218, CUR)}</b> at a store from your checking
              account.
              <span className="block text-[12px] text-[var(--ni-muted)]">
                Over your <span className="tabular-nums">{formatMoney(big, CUR)}</span> alert
              </span>
            </p>
          </div>

          {adult && (partners.length > 0 || kids.length > 0) && (
            <>
              <Sub>Who else hears</Sub>
              <Rows>
                {partner && (
                  <Row
                    i={8}
                    label={
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <Avatar member={partner} small />
                        Share my alerts with{' '}
                        {partners.length > 1 ? (
                          <select
                            aria-label="Partner to share alerts with"
                            className="rounded-[14px] border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2 py-1 text-[14px] font-semibold"
                            value={partner.user_id}
                            onChange={(e) => {
                              setPick(e.target.value)
                              if (s.share_with) save({ share_with: e.target.value })
                            }}
                          >
                            {partners.map((m) => (
                              <option key={m.user_id} value={m.user_id}>
                                {nameOf(m)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          nameOf(partner)
                        )}
                      </span>
                    }
                    note="All your accounts. Only alerts about what you already share with them in Family."
                  >
                    <Toggle
                      label={`Share my alerts with ${nameOf(partner)}`}
                      checked={s.share_with === partner.user_id}
                      onChange={(v) => save({ share_with: v ? partner.user_id : null })}
                    />
                  </Row>
                )}
                {kids.map((k, i) => (
                  <Row
                    key={k.user_id}
                    i={9 + i}
                    label={
                      <span className="inline-flex items-center gap-2">
                        <Avatar member={k} small />
                        {nameOf(k)}&apos;s alerts
                      </span>
                    }
                    note={`Big purchases and banks to reconnect come to you and the other adults. ${nameOf(k)} never gets yours.`}
                  >
                    <span className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[12px] font-semibold">Always on</span>
                    {/* Dashed: someone else's money, as in Family. Off until you ask (#269). */}
                    <span className="flex basis-full items-center gap-3 rounded-[16px] border border-dashed border-zinc-400 dark:border-zinc-600 px-3 py-2">
                      <span className="min-w-0 grow text-[14px] font-medium">Email me when {nameOf(k)}&apos;s bank needs reconnecting</span>
                      <Toggle
                        label={`Email me when ${nameOf(k)}'s bank needs reconnecting`}
                        checked={kidEmails.includes(k.user_id)}
                        onChange={(v) => save({ email_kid_reconnect: v ? [...kidEmails, k.user_id] : kidEmails.filter((id) => id !== k.user_id) })}
                      />
                    </span>
                  </Row>
                ))}
              </Rows>
            </>
          )}
          <p className={`${NOTE} mt-3`} role="status" aria-live="polite">
            {status || 'Every email has a link to stop it.'}
          </p>
        </>
      )}
    </Panel>
  )
}
