-- 0022: Close an alert (#267, Dinesh asked 2026-11-03): an × on each alert and
-- "Close all" for a day take it out of the bell's list for good. A bank that
-- still needs reconnecting stays on Home's strip until it's done: closing it
-- here doesn't fix the bank.

alter table public.notifications add column dismissed_at timestamptz;

grant update (dismissed_at) on public.notifications to authenticated;
