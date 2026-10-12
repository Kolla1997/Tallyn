-- 0012_card_details_state: what the bank last said about card details (#51)
--
-- plaid_items.card_details, written by the sync after each card-details fetch:
--   shared          the bank shares them (some cards may still have none)
--   consent_needed  the person must agree in Plaid first (Add APR and due dates)
--   not_offered     the bank doesn't offer card details at all
-- null means not asked yet. The app shows "Add APR and due dates" only when
-- it can help (null or consent_needed). Same visibility as the bank row.

alter table public.plaid_items
  add column card_details text check (card_details in ('shared', 'consent_needed', 'not_offered'));

grant select (card_details) on public.plaid_items to authenticated;
grant select (card_details), update (card_details) on public.plaid_items to tallyn_sync;

-- Ask every bank again on the next sync, so the state fills in now rather
-- than after the daily wait.
update public.plaid_items set liabilities_synced_at = null;
