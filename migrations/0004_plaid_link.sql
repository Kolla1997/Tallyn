-- 0004_plaid_link: the narrow write path for linking and unlinking banks (#8)
--
-- Users can't write plaid_items or accounts directly (0002). Linking a bank is
-- still a user action, so it goes through these two functions instead
-- (ADR 0004). They run with the owner's rights but check, inside the
-- database, that the caller may do it:
--
--   link_plaid_item       only owners and adults link, and only for
--                         themselves: owner_user_id is always auth.uid().
--   plaid_item_for_unlink returns the encrypted token so the backend can
--                         revoke it at Plaid (/item/remove), only to someone
--                         allowed to unlink (same rule as plaid_items_delete).
--
-- The access token arrives already encrypted by the Go backend
-- (TOKEN_ENCRYPTION_KEY). The database never sees it in plain text.
-- The bank sync (#9) gets its own system role; these functions aren't for it.

create or replace function public.link_plaid_item(
  p_household_id           uuid,
  p_plaid_item_id          text,
  p_access_token_encrypted bytea,
  p_institution_id         text,
  p_institution_name       text,
  p_accounts               jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  item uuid;
  a    jsonb;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if not public.has_household_role(p_household_id, array['owner', 'adult']) then
    raise exception 'only owners and adults can link a bank' using errcode = '42501';
  end if;

  if coalesce(char_length(p_plaid_item_id), 0) not between 1 and 200
     or p_access_token_encrypted is null
     or octet_length(p_access_token_encrypted) not between 29 and 4096
     or char_length(p_institution_id) > 200
     or char_length(p_institution_name) > 200
     or jsonb_typeof(p_accounts) is distinct from 'array'
     or jsonb_array_length(p_accounts) not between 1 and 100
  then
    raise exception 'invalid bank link' using errcode = '22023';
  end if;

  insert into public.plaid_items
    (household_id, owner_user_id, plaid_item_id, access_token_encrypted, institution_id, institution_name)
  values
    (p_household_id, uid, p_plaid_item_id, p_access_token_encrypted, p_institution_id, p_institution_name)
  returning id into item;

  for a in select value from jsonb_array_elements(p_accounts)
  loop
    if char_length(a ->> 'plaid_account_id') not between 1 and 200
       or char_length(a ->> 'name') not between 1 and 200
       or char_length(a ->> 'type') not between 1 and 50
       or char_length(a ->> 'official_name') > 200
       or char_length(a ->> 'subtype') > 50
       or char_length(a ->> 'mask') > 4
    then
      raise exception 'invalid bank account' using errcode = '22023';
    end if;

    insert into public.accounts
      (household_id, plaid_item_id, owner_user_id, plaid_account_id, name, official_name,
       mask, type, subtype, currency, current_balance_minor, available_balance_minor, balance_updated_at)
    values
      (p_household_id, item, uid, a ->> 'plaid_account_id', a ->> 'name', a ->> 'official_name',
       a ->> 'mask', a ->> 'type', a ->> 'subtype', a ->> 'currency',
       (a ->> 'current_balance_minor')::bigint, (a ->> 'available_balance_minor')::bigint, now());
  end loop;

  return item;
end;
$$;

-- Returns no row, rather than an error, when the item doesn't exist or the
-- caller may not unlink it, so callers can't probe for other households' items.
create or replace function public.plaid_item_for_unlink(p_item_id uuid)
returns table (plaid_item_id text, access_token_encrypted bytea)
language sql stable
security definer
set search_path = ''
as $$
  select i.plaid_item_id, i.access_token_encrypted
  from public.plaid_items i
  where i.id = p_item_id
    and auth.uid() is not null
    and (
      (i.owner_user_id = auth.uid() and public.is_household_member(i.household_id))
      or public.has_household_role(i.household_id, array['owner'])
    )
$$;

revoke all on function public.link_plaid_item(uuid, text, bytea, text, text, jsonb) from public, anon;
revoke all on function public.plaid_item_for_unlink(uuid) from public, anon;
grant execute on function public.link_plaid_item(uuid, text, bytea, text, text, jsonb) to authenticated;
grant execute on function public.plaid_item_for_unlink(uuid) to authenticated;
