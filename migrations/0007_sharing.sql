-- 0007_sharing: each person chooses what other members see of their money (#28, ADR 0007)
--
-- Visibility moves from role-based (0001: owners, adults and viewers saw every
-- member's banks and transactions) to consent-based. Decided 2026-10-09:
--   - Everyone sees their own money.
--   - Nobody sees another member's money until that member shares it.
--   - Parents see their kids automatically: owners and adults see everything
--     of teens and children.
--   - Teens and children see only their own money, whatever is shared with
--     them, and aren't shown what parents can see.
--   - Viewers see only what's shared with them.
--   - You unlink your own banks; owners can also unlink teens' and children's.
--
-- Categories: balances (banks, accounts, balances), transactions, whereabouts
-- (time and location; only with transactions). Debts come with #27.
-- One function, can_see_member_data(), decides; every policy uses it.

-- ---------------------------------------------------------------------------
-- shares: one row per (whose money, who sees it, what)
-- ---------------------------------------------------------------------------

create table public.shares (
  household_id   uuid not null,
  owner_user_id  uuid not null,  -- whose money; only they can add or remove the row
  viewer_user_id uuid not null,  -- who may see it
  category       text not null check (category in ('balances', 'transactions', 'whereabouts')),
  created_at     timestamptz not null default now(),
  primary key (household_id, owner_user_id, viewer_user_id, category),
  check (owner_user_id <> viewer_user_id),
  -- Both must be members; leaving the household removes their shares.
  foreign key (household_id, owner_user_id)
    references public.household_members (household_id, user_id) on delete cascade,
  foreign key (household_id, viewer_user_id)
    references public.household_members (household_id, user_id) on delete cascade
);

create index shares_viewer_idx on public.shares (household_id, viewer_user_id);

-- ---------------------------------------------------------------------------
-- The visibility rule
-- ---------------------------------------------------------------------------

-- May the current user see `p_category` of `owner_id`'s money in household `hid`?
create or replace function public.can_see_member_data(hid uuid, owner_id uuid, p_category text) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and public.is_household_member(hid)
     and (
       -- your own money
       owner_id = auth.uid()
       or (
         -- teens and children see only their own
         not public.has_household_role(hid, array['teen', 'child'])
         and (
           -- parents (owners, adults) see their kids automatically
           (public.has_household_role(hid, array['owner', 'adult'])
            and exists (
              select 1 from public.household_members k
              where k.household_id = hid and k.user_id = owner_id and k.role in ('teen', 'child')
            ))
           -- everyone else: only what the owner shared with you
           or (exists (
                 select 1 from public.shares s
                 where s.household_id = hid and s.owner_user_id = owner_id
                   and s.viewer_user_id = auth.uid() and s.category = p_category
               )
               -- time and location only together with transactions
               and (p_category <> 'whereabouts' or exists (
                 select 1 from public.shares s
                 where s.household_id = hid and s.owner_user_id = owner_id
                   and s.viewer_user_id = auth.uid() and s.category = 'transactions'
               )))
         )
       )
     )
$$;

-- Same, for a bank account (looks up its household and owner without RLS,
-- so transactions don't depend on the account itself being visible).
create or replace function public.can_see_account_data(acct uuid, p_category text) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.accounts a
    where a.id = acct and public.can_see_member_data(a.household_id, a.owner_user_id, p_category)
  )
$$;

-- May the current user unlink a bank owned by `owner_id`? Their own, or an
-- owner unlinking a teen's or child's.
create or replace function public.can_unlink(hid uuid, owner_id uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and public.is_household_member(hid)
     and (
       owner_id = auth.uid()
       or (public.has_household_role(hid, array['owner'])
           and exists (
             select 1 from public.household_members k
             where k.household_id = hid and k.user_id = owner_id and k.role in ('teen', 'child')
           ))
     )
$$;

-- The old helpers now follow the new rule, in case anything still calls them.
create or replace function public.can_see_member_item(hid uuid, owner_id uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select public.can_see_member_data(hid, owner_id, 'balances')
$$;

create or replace function public.can_see_whereabouts(hid uuid, owner_id uuid) returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select public.can_see_member_data(hid, owner_id, 'whereabouts')
$$;

revoke all on function public.can_see_member_data(uuid, uuid, text) from public, anon;
revoke all on function public.can_see_account_data(uuid, text) from public, anon;
revoke all on function public.can_unlink(uuid, uuid) from public, anon;
grant execute on function public.can_see_member_data(uuid, uuid, text) to authenticated;
grant execute on function public.can_see_account_data(uuid, text) to authenticated;
grant execute on function public.can_unlink(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Policies: bank data now follows the sharing rule
-- ---------------------------------------------------------------------------

drop policy plaid_items_select on public.plaid_items;
create policy plaid_items_select on public.plaid_items
  for select to authenticated
  using (public.can_see_member_data(household_id, owner_user_id, 'balances'));

drop policy plaid_items_delete on public.plaid_items;
create policy plaid_items_delete on public.plaid_items
  for delete to authenticated
  using (public.can_unlink(household_id, owner_user_id));

drop policy accounts_select on public.accounts;
create policy accounts_select on public.accounts
  for select to authenticated
  using (public.can_see_member_data(household_id, owner_user_id, 'balances'));

drop policy transactions_select on public.transactions;
create policy transactions_select on public.transactions
  for select to authenticated
  using (public.can_see_account_data(account_id, 'transactions'));

drop policy transaction_details_select on public.transaction_details;
create policy transaction_details_select on public.transaction_details
  for select to authenticated
  using (exists (
    select 1 from public.transactions t
    where t.id = transaction_details.transaction_id
      and public.can_see_account_data(t.account_id, 'whereabouts')
  ));

-- Unlinking: the lookup that returns the encrypted token follows the same rule.
create or replace function public.plaid_item_for_unlink(p_item_id uuid)
returns table (plaid_item_id text, access_token_encrypted bytea)
language sql stable
security definer
set search_path = ''
as $$
  select i.plaid_item_id, i.access_token_encrypted
  from public.plaid_items i
  where i.id = p_item_id and public.can_unlink(i.household_id, i.owner_user_id)
$$;

-- ---------------------------------------------------------------------------
-- shares: who may read and change them
-- ---------------------------------------------------------------------------

alter table public.shares enable row level security;

revoke all on public.shares from anon, authenticated;
grant select, insert, delete on public.shares to authenticated;

-- You see what you share and what's shared with you.
create policy shares_select on public.shares
  for select to authenticated
  using (
    public.is_household_member(household_id)
    and (owner_user_id = auth.uid() or viewer_user_id = auth.uid())
  );

-- You share only your own money, only with members who can use it: not
-- teens or children (they see only their own).
create policy shares_insert on public.shares
  for insert to authenticated
  with check (
    owner_user_id = auth.uid()
    and public.is_household_member(household_id)
    and not exists (
      select 1 from public.household_members v
      where v.household_id = shares.household_id and v.user_id = shares.viewer_user_id
        and v.role in ('teen', 'child')
    )
  );

create policy shares_delete on public.shares
  for delete to authenticated
  using (owner_user_id = auth.uid());
