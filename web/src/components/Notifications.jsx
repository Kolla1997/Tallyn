import { useEffect, useId, useRef, useState } from 'react'
import { BellIcon } from './Icons.jsx'
import { navigate } from '../lib/router.jsx'
import { describe, groups, markRead, needsYou, refresh, useNotifications, when } from '../lib/notifications.js'
import { ReconnectBank } from '../screens/Banks.jsx'

// In-app notifications (#267, Dinesh picked draft C, with the bell top right
// of the page): the bell holds every alert; alerts that need you (a bank to
// reconnect) also show on Home as a strip until they're done (NeedsYou).
// The list is glass turned the other way round (Dinesh): dark glass in light mode, light glass in
// dark mode, opaque enough to read over the page. On phones it
// spans the screen under the header; from 1024px it drops from the bell.

function Words({ parts, inverse }) {
  return parts.map((p, i) =>
    typeof p === 'string' ? (
      <span key={i}>{p}</span>
    ) : (
      <b key={i} className={`font-semibold ${inverse ? 'text-white dark:text-zinc-900' : 'text-zinc-900 dark:text-white'} ${p.money ? 'tabular-nums' : ''}`}>
        {p.b}
      </b>
    ),
  )
}

export function NotificationBell({ className = '' }) {
  const { list } = useNotifications()
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const panelId = useId()
  const unread = (list ?? []).filter((n) => !n.read).length
  const needs = needsYou(list).length

  // Close on Escape or a click outside.
  useEffect(() => {
    if (!open) return
    const key = (e) => e.key === 'Escape' && setOpen(false)
    const click = (e) => box.current && !box.current.contains(e.target) && setOpen(false)
    document.addEventListener('keydown', key)
    document.addEventListener('mousedown', click)
    return () => {
      document.removeEventListener('keydown', key)
      document.removeEventListener('mousedown', click)
    }
  }, [open])

  const go = (n, to) => {
    if (!n.read) markRead(n.id)
    setOpen(false)
    navigate(to)
  }

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        type="button"
        className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white p-0 text-zinc-700 transition-colors duration-150 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:text-white"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <BellIcon width={16} height={16} />
        {unread > 0 && (
          <span className="notif-badge absolute -top-1 -right-1 min-w-[18px] rounded-full bg-[var(--color-redesign-accent)] px-[5px] text-center text-[11px] leading-[18px] font-semibold tabular-nums text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <section
          id={panelId}
          aria-label="Notifications"
          className="notif-panel fixed inset-x-4 top-16 notif-glass border border-white/10 dark:border-zinc-900/10 bg-[var(--glass-surface-dark)] text-white backdrop-blur-xl dark:bg-white/90 dark:text-zinc-900 shadow-xl z-50 flex max-h-[min(560px,75vh)] lg:absolute lg:inset-x-auto lg:right-0 lg:top-[calc(100%+8px)] lg:w-[380px] flex-col rounded-3xl p-4"
        >
          <div className="flex items-baseline justify-between">
            <h2 className="text-[16px] font-semibold">Notifications</h2>
            {unread > 0 && (
              <button type="button" className="link text-[13px] !text-zinc-200 dark:!text-zinc-700" onClick={() => markRead()}>
                Mark all read
              </button>
            )}
          </div>
          {!list ? (
            <p className="mt-4 text-[14px] text-zinc-400 dark:text-zinc-500">Adding it all up…</p>
          ) : list.length === 0 ? (
            <p className="mt-4 text-[14px] text-zinc-400 dark:text-zinc-500">Nothing new. We&apos;ll tell you here when something changes.</p>
          ) : (
            <div className="-mx-2 mt-1 overflow-y-auto px-2">
              {groups(list).map(([label, items]) => (
                <div key={label}>
                  <h3 className="mt-4 mb-1 text-[12px] font-medium text-zinc-400 dark:text-zinc-500">{label}</h3>
                  <ul className="m-0 list-none p-0">
                    {items.map((n) => {
                      const { parts, to } = describe(n)
                      return (
                        <li key={n.id} className="calm-row">
                          <button
                            type="button"
                            className="relative -mx-2 block w-[calc(100%+16px)] rounded-xl border-0 bg-transparent px-2 py-2 pr-6 text-left text-[14px] text-zinc-300 dark:text-zinc-700 hover:bg-white/10 dark:hover:bg-zinc-900/5"
                            onClick={() => go(n, to)}
                          >
                            <Words parts={parts} inverse />
                            <span className="mt-0.5 block text-[12px] text-zinc-400 dark:text-zinc-500">
                              {when(n.created_at)}
                              {n.needs_action && !n.resolved && ' · Needs you'}
                            </span>
                            {!n.read && <span className="absolute top-3.5 right-2 size-2 rounded-full bg-[var(--color-redesign-accent)]" aria-label="Unread" />}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {/* From the tally tape: a double rule that adds it up, so you know you're done reading. */}
          {list?.length > 0 && (
            <p className="mt-3 flex justify-between pt-2 text-[13px] tabular-nums" style={{ borderTop: '3px double currentColor' }}>
              <span>{unread} new</span>
              <span>{needs} needs you</span>
            </p>
          )}
        </section>
      )}
    </div>
  )
}

// Home's strip: one line per alert you must act on, until it's done.
export function NeedsYou({ householdId }) {
  const { list } = useNotifications()
  const [error, setError] = useState('')
  const open = needsYou(list).filter((n) => !householdId || n.household_id === householdId)
  if (!open.length) return null
  return (
    <div className="mb-3 grid gap-2">
      {open.map((n) => (
        <div
          key={n.id}
          className="calm-glass calm-card flex flex-wrap items-center gap-3 rounded-2xl border-l-[3px] border-l-[var(--color-redesign-accent)] px-4 py-3"
          role="status"
        >
          <p className="min-w-0 flex-1 text-[14px]">
            <Words parts={describe(n).parts} />
          </p>
          {n.kind === 'reconnect' && (
            <ReconnectBank
              bankId={n.ref_id}
              label="Reconnect"
              onDone={() => {
                markRead(n.id)
                refresh()
              }}
              onError={setError}
            />
          )}
        </div>
      ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
