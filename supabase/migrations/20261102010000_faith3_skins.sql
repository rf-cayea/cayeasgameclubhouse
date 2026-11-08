-- Upgrade an existing Clubhouse database. No wallet balances or ownership reset.
begin;
do $$
begin
  if to_regclass('public.wallets') is null or to_regclass('public.store_catalog') is null then
    raise exception 'The initial Clubhouse schema must be installed before this upgrade.';
  end if;
end; $$;

alter table public.store_catalog drop constraint if exists store_catalog_currency_check;
alter table public.store_catalog add constraint store_catalog_currency_check check(currency in ('rummy_points','spades_points','points'));
alter table public.store_catalog drop constraint if exists store_catalog_slot_check;
alter table public.store_catalog add constraint store_catalog_slot_check check(slot in ('spades_table','spades_deck','faith3_skin'));
insert into public.store_catalog(id,name,price,currency,slot) values
 ('faith3-skin-celestial','Moonlit Celestial',300,'points','faith3_skin'),
 ('faith3-skin-jade','Jade Sanctuary',450,'points','faith3_skin'),
 ('faith3-skin-rose','Rose Quartz',600,'points','faith3_skin')
on conflict(id) do update set name=excluded.name,price=excluded.price,currency=excluded.currency,slot=excluded.slot,enabled=true;

alter table public.store_catalog drop constraint if exists faith3_skins_fixed_catalog;
alter table public.store_catalog add constraint faith3_skins_fixed_catalog check(
  id not in ('faith3-skin-celestial','faith3-skin-jade','faith3-skin-rose') or
  (currency='points' and slot is not distinct from 'faith3_skin' and price=case id when 'faith3-skin-celestial' then 300 when 'faith3-skin-jade' then 450 else 600 end));

create or replace function public.purchase_store_item(_item_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.store_catalog%rowtype; wallet public.wallets%rowtype; balance integer;
begin
  if actor is null then raise exception 'Sign in required.' using errcode='42501'; end if;
  select * into item from public.store_catalog where id=_item_id and enabled for share;
  if not found then raise exception 'Store item is unavailable.' using errcode='22023'; end if;
  select * into wallet from public.wallets where user_id=actor for update;
  if not found then raise exception 'Your wallet is unavailable.' using errcode='22023'; end if;
  balance:=case item.currency when 'points' then wallet.points when 'spades_points' then wallet.spades_points when 'rummy_points' then wallet.rummy_points else null end;
  if balance is null then raise exception 'Unsupported store currency.' using errcode='22023'; end if;
  if item.id=any(wallet.owned) then
    return jsonb_build_object('item_id',item.id,'owned',true,'already_owned',true,'balance',balance,'currency',item.currency,'price',item.price);
  end if;
  if balance<item.price then raise exception 'Not enough %.',case item.currency when 'points' then 'Clubhouse Cash' when 'spades_points' then 'Spades points' else 'Rummy+ points' end using errcode='22023'; end if;
  update public.wallets set points=points-case when item.currency='points' then item.price else 0 end,
    spades_points=spades_points-case when item.currency='spades_points' then item.price else 0 end,
    rummy_points=rummy_points-case when item.currency='rummy_points' then item.price else 0 end,
    owned=array_append(owned,item.id) where user_id=actor;
  insert into public.store_purchases(user_id,item_id,price,currency) values(actor,item.id,item.price,item.currency);
  return jsonb_build_object('item_id',item.id,'owned',true,'already_owned',false,'balance',balance-item.price,'currency',item.currency,'price',item.price);
end; $$;

create or replace function public.equip_store_item(_slot text,_item_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); wallet public.wallets%rowtype; item public.store_catalog%rowtype;
begin
  if actor is null then raise exception 'Sign in required.' using errcode='42501'; end if;
  if _slot is null or _slot not in ('spades_table','spades_deck','faith3_skin') or _item_id is null then raise exception 'Invalid cosmetic slot.' using errcode='22023'; end if;
  select * into wallet from public.wallets where user_id=actor for update;
  if not found then raise exception 'Your wallet is unavailable.' using errcode='22023'; end if;
  if not ((_slot='spades_table' and _item_id='spades-table-classic') or (_slot='spades_deck' and _item_id='spades-deck-classic') or (_slot='faith3_skin' and _item_id='faith3-classic')) then
    select * into item from public.store_catalog where id=_item_id and slot=_slot and enabled;
    if not found or not _item_id=any(wallet.owned) then raise exception 'Collect this design before equipping it.' using errcode='22023'; end if;
  end if;
  update public.wallets set equipped=jsonb_set(equipped,array[_slot],to_jsonb(_item_id),true) where user_id=actor;
  return jsonb_build_object('item_id',_item_id,'slot',_slot);
end; $$;
revoke all on function public.purchase_store_item(text),public.equip_store_item(text,text) from public,anon,authenticated;
grant execute on function public.purchase_store_item(text),public.equip_store_item(text,text) to authenticated;
notify pgrst,'reload schema';
commit;
