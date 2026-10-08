-- 0002_bank: Plaid items, bank accounts and transactions, with RLS (#6)
--
-- Money is stored as whole minor units (cents, pence, yen...) in bigint,
-- always next to its currency code. The Go backend converts using the
-- ISO 4217 exponent of each currency. Never use floats for money.
--
-- Users can read these tables (within RLS) but not write accounts or
-- transactions: those rows come only from the bank sync (#8, #9).

-- ---------------------------------------------------------------------------
-- plaid_items: one bank connection (Plaid Item)
-- ---------------------------------------------------------------------------

create table public.plaid_items (
  id                     uuid primary key default gen_random_uuid(),
  household_id           uuid not null references public.households (id) on delete cascade,
  -- The member who linked the bank. Teens and children see only their own.
  owner_user_id          uuid not null references public.profiles (id) on delete cascade,
  plaid_item_id          text not null unique,
  -- Encrypted by the Go backend (TOKEN_ENCRYPTION_KEY) before it gets here.
  -- Never readable by app users: authenticated has no SELECT on this column.
  access_token_encrypted bytea not null,
  institution_id         text,
  institution_name       text,
  -- Plaid /transactions/sync cursor (#9)
  transactions_cursor    text,
  status                 text not null default 'active'
                           check (status in ('active', 'needs_reauth', 'disconnected')),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (id, household_id)
);

create index plaid_items_household_id_idx on public.plaid_items (household_id);

create trigger plaid_items_set_updated_at
  before update on public.plaid_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- accounts: bank accounts and cards under a Plaid item
-- ---------------------------------------------------------------------------

create table public.accounts (
  id                      uuid primary key default gen_random_uuid(),
  household_id            uuid not null references public.households (id) on delete cascade,
  plaid_item_id           uuid not null,
  owner_user_id           uuid not null references public.profiles (id) on delete cascade,
  plaid_account_id        text not null unique,
  name                    text not null,
  official_name           text,
  mask                    text,            -- last 2-4 digits, never the full number
  type                    text not null,   -- Plaid type: depository, credit, loan, investment...
  subtype                 text,
  -- ISO 4217 code, or Plaid's unofficial code (e.g. crypto)
  currency                text not null check (currency ~ '^[A-Z0-9]{3,10}$'),
  current_balance_minor   bigint,
  available_balance_minor bigint,
  balance_updated_at      timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (id, household_id),
  -- The account must be in the same household as its Plaid item.
  foreign key (plaid_item_id, household_id)
    references public.plaid_items (id, household_id) on delete cascade
);

create index accounts_household_id_idx on public.accounts (household_id);
create index accounts_plaid_item_id_idx on public.accounts (plaid_item_id);

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------

create table public.transactions (
  id                   uuid primary key default gen_random_uuid(),
  household_id         uuid not null references public.households (id) on delete cascade,
  account_id           uuid not null,
  plaid_transaction_id text not null unique,
  -- Plaid's sign: positive = money out, negative = money in.
  amount_minor         bigint not null,
  currency             text not null check (currency ~ '^[A-Z0-9]{3,10}$'),
  date                 date not null,
  authorized_date      date,
  name                 text not null,
  merchant_name        text,
  -- Plaid personal_finance_category. Tallyn's own categories come with #13.
  category_primary     text,
  category_detailed    text,
  pending              boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- The transaction must be in the same household as its account.
  foreign key (account_id, household_id)
    references public.accounts (id, household_id) on delete cascade
);

create index transactions_account_id_date_idx   on public.transactions (account_id, date desc);
create index transactions_household_id_date_idx on public.transactions (household_id, date desc);

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on public.plaid_items, public.accounts, public.transactions from anon, authenticated;

-- Every column except access_token_encrypted and the sync cursor.
grant select (id, household_id, owner_user_id, plaid_item_id, institution_id,
              institution_name, status, created_at, updated_at)
  on public.plaid_items to authenticated;
-- Unlinking a bank deletes its accounts and transactions (cascade).
grant delete on public.plaid_items to authenticated;

grant select on public.accounts, public.transactions to authenticated;

-- TODO(#8): writing plaid_items, accounts and transactions goes through the
-- backend's system path for bank sync (see ADR 0002), not through user requests.

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.plaid_items  enable row level security;
alter table public.accounts     enable row level security;
alter table public.transactions enable row level security;

create policy plaid_items_select on public.plaid_items
  for select to authenticated
  using (public.can_see_member_item(household_id, owner_user_id));

-- The member who linked it, or a household owner, can unlink it.
create policy plaid_items_delete on public.plaid_items
  for delete to authenticated
  using (
    (owner_user_id = auth.uid() and public.is_household_member(household_id))
    or public.has_household_role(household_id, array['owner'])
  );

create policy accounts_select on public.accounts
  for select to authenticated
  using (public.can_see_member_item(household_id, owner_user_id));

-- A transaction is visible if its account is (accounts RLS applies inside).
create policy transactions_select on public.transactions
  for select to authenticated
  using (exists (select 1 from public.accounts a where a.id = transactions.account_id));
