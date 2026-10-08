-- 0003_fx_rates: daily exchange rates for the multi-currency total (#6, used by #11)
--
-- One row per currency pair per day: 1 unit of base = rate units of quote.
-- Rates are public data, so every signed-in user can read them. Only the
-- backend's system path writes them.
-- TODO(#11): choose the rate source and how often to refresh.

create table public.fx_rates (
  base       text not null check (base ~ '^[A-Z0-9]{3,10}$'),
  quote      text not null check (quote ~ '^[A-Z0-9]{3,10}$'),
  as_of      date not null,
  rate       numeric(24, 12) not null check (rate > 0),
  source     text not null,
  created_at timestamptz not null default now(),
  primary key (base, quote, as_of)
);

revoke all on public.fx_rates from anon, authenticated;
grant select on public.fx_rates to authenticated;

alter table public.fx_rates enable row level security;

create policy fx_rates_select on public.fx_rates
  for select to authenticated
  using (true);
