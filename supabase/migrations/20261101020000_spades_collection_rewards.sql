-- Spades wallets, permanent cosmetics, and trusted four-player match rewards.
begin;
alter table public.wallets add column spades_points integer not null default 0 check(spades_points>=0);
alter table public.point_awards add column spades_tier text check(spades_tier in ('easy','normal','hard','humans'));
alter table public.store_catalog drop constraint store_catalog_currency_check;
alter table public.store_catalog add constraint store_catalog_currency_check check(currency in ('rummy_points','spades_points'));
alter table public.store_catalog add column slot text check(slot in ('spades_table','spades_deck'));
insert into public.store_catalog(id,name,price,currency,slot) values
 ('spades-table-atlas','Moonlit Observatory',500,'spades_points','spades_table'),
 ('spades-table-ember','Rosewood Parlour',650,'spades_points','spades_table'),
 ('spades-table-grove','Emerald Conservatory',800,'spades_points','spades_table'),
 ('spades-table-deco','Gilded Grand Hall',950,'spades_points','spades_table'),
 ('spades-deck-atlas','Midnight Atlas',350,'spades_points','spades_deck'),
 ('spades-deck-ember','Ember Crown',500,'spades_points','spades_deck'),
 ('spades-deck-grove','Verdant Grove',650,'spades_points','spades_deck'),
 ('spades-deck-deco','Ivory Deco',800,'spades_points','spades_deck');

create or replace function public.purchase_store_item(_item_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.store_catalog%rowtype; wallet public.wallets%rowtype; balance integer;
begin
  if actor is null then raise exception 'Sign in required.' using errcode='42501'; end if;
  select * into item from public.store_catalog where id=_item_id and enabled for share;
  if not found then raise exception 'Store item is unavailable.' using errcode='22023'; end if;
  select * into wallet from public.wallets where user_id=actor for update;
  if not found then raise exception 'Your wallet is unavailable.' using errcode='22023'; end if;
  balance:=case item.currency when 'spades_points' then wallet.spades_points else wallet.rummy_points end;
  if not item.id=any(wallet.owned) then
    if balance<item.price then raise exception 'Not enough % points.',case when item.currency='spades_points' then 'Spades' else 'Rummy+' end using errcode='22023'; end if;
    update public.wallets set spades_points=spades_points-case when item.currency='spades_points' then item.price else 0 end,
      rummy_points=rummy_points-case when item.currency='rummy_points' then item.price else 0 end,owned=array_append(owned,item.id) where user_id=actor;
    insert into public.store_purchases(user_id,item_id,price,currency) values(actor,item.id,item.price,item.currency);
    return jsonb_build_object('item_id',item.id,'owned',true,'already_owned',false,'balance',balance-item.price,'currency',item.currency,'price',item.price);
  end if;
  return jsonb_build_object('item_id',item.id,'owned',true,'already_owned',true,'balance',balance,'currency',item.currency,'price',item.price);
end; $$;

create function public.equip_store_item(_slot text,_item_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); wallet public.wallets%rowtype; item public.store_catalog%rowtype;
begin
  if actor is null then raise exception 'Sign in required.' using errcode='42501'; end if;
  if _slot is null or _slot not in ('spades_table','spades_deck') or _item_id is null then raise exception 'Invalid cosmetic slot.' using errcode='22023'; end if;
  select * into wallet from public.wallets where user_id=actor for update;
  if not found then raise exception 'Your wallet is unavailable.' using errcode='22023'; end if;
  if not ((_slot='spades_table' and _item_id='spades-table-classic') or (_slot='spades_deck' and _item_id='spades-deck-classic')) then
    select * into item from public.store_catalog where id=_item_id and slot=_slot and enabled;
    if not found or not _item_id=any(wallet.owned) then raise exception 'Collect this design before equipping it.' using errcode='22023'; end if;
  end if;
  update public.wallets set equipped=jsonb_set(equipped,array[_slot],to_jsonb(_item_id),true) where user_id=actor;
  return jsonb_build_object('item_id',_item_id,'slot',_slot);
end; $$;
revoke all on function public.equip_store_item(text,text) from public,anon,authenticated;
grant execute on function public.equip_store_item(text,text) to authenticated;

alter table public.point_conversions drop constraint point_conversions_game_check;
alter table public.point_conversions add constraint point_conversions_game_check check(game in ('faith-3','rummy','spades'));
create or replace function public.convert_game_points(_game text,_amount integer,_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); wallet public.wallets%rowtype; prior public.point_conversions%rowtype; cash integer; balance integer;
begin
  if actor is null then raise exception 'Sign in to convert points.' using errcode='42501'; end if;
  if _game is null or _game not in ('faith-3','rummy','spades') or _amount is null or _amount<=0 or _amount%10<>0 or _request_id is null then raise exception 'Convert a positive multiple of ten game points.' using errcode='22023'; end if;
  select * into wallet from public.wallets where user_id=actor for update;
  if not found then raise exception 'Your wallet is unavailable.' using errcode='22023'; end if;
  select * into prior from public.point_conversions where user_id=actor and request_id=_request_id;
  if found then
    if prior.game<>_game or prior.amount<>_amount then raise exception 'Conversion ID already belongs to another conversion.' using errcode='22023'; end if;
    return jsonb_build_object('cash',prior.cash,'amount',prior.amount,'already_converted',true);
  end if;
  balance:=case _game when 'spades' then wallet.spades_points when 'rummy' then wallet.rummy_points else wallet.f3_points end;
  if balance<_amount then raise exception 'Not enough game points.' using errcode='22023'; end if;
  cash:=(_amount/10)*7;
  update public.wallets set spades_points=spades_points-case when _game='spades' then _amount else 0 end,
    rummy_points=rummy_points-case when _game='rummy' then _amount else 0 end,f3_points=f3_points-case when _game='faith-3' then _amount else 0 end,points=points+cash where user_id=actor;
  insert into public.point_conversions(user_id,request_id,game,amount,cash) values(actor,_request_id,_game,_amount,cash);
  return jsonb_build_object('cash',cash,'amount',_amount,'already_converted',false);
end; $$;

create table public.spades_reward_receipts (
  match_id uuid primary key,user_ids uuid[] not null,tier text not null check(tier in ('easy','normal','hard','humans')),
  amount integer not null check(amount in (40,70,120,150)),result jsonb not null,source text not null unique,credited_at timestamptz not null default now()
);
alter table public.spades_reward_receipts enable row level security;
revoke all on public.spades_reward_receipts from public,anon,authenticated;
create function public.credit_spades_match(_result jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
<<reward>>
declare
  match_id uuid; variant text; mode text; target integer; winner integer; amount integer; tier text; source text;
  player jsonb; uid uuid; users uuid[]:='{}'; winners uuid[]:='{}'; levels text[]:='{}'; bots integer:=0; humans integer:=0; seat integer:=0;
  winning_score integer; score jsonb; completed timestamptz; added uuid; wallet_count integer; prior public.spades_reward_receipts%rowtype;
begin
  if _result is null or jsonb_typeof(_result)<>'object' or _result->'version' is distinct from '1'::jsonb or
    (select count(*) from jsonb_object_keys(_result))<>9 or exists(select 1 from jsonb_object_keys(_result) k where k not in ('version','match_id','mode','variant','target','players','scores','winner','completed_at')) then raise exception 'Invalid verified Spades result.' using errcode='22023'; end if;
  match_id:=(_result->>'match_id')::uuid; variant:=_result->>'variant'; mode:=_result->>'mode';
  if match_id is null or variant is null or variant not in ('solo','teams') or mode is null or mode not in ('bot','online') or
    jsonb_typeof(_result->'target') is distinct from 'number' or (_result->>'target') not in ('100','250','500','1000') or
    jsonb_typeof(_result->'winner') is distinct from 'number' or (_result->>'winner')!~'^[0-3]$' or
    jsonb_typeof(_result->'players') is distinct from 'array' or jsonb_array_length(_result->'players')<>4 or
    jsonb_typeof(_result->'scores') is distinct from 'array' then raise exception 'Invalid Spades game evidence.' using errcode='22023'; end if;
  target:=(_result->>'target')::integer; winner:=(_result->>'winner')::integer; completed:=(_result->>'completed_at')::timestamptz;
  if completed is null or not isfinite(completed) or completed>now()+interval '5 minutes' or jsonb_array_length(_result->'scores')<>(case when variant='teams' then 2 else 4 end) or winner>=jsonb_array_length(_result->'scores') then raise exception 'Invalid Spades completion.' using errcode='22023'; end if;
  for score in select value from jsonb_array_elements(_result->'scores') loop
    if jsonb_typeof(score)<>'number' or score::text!~'^-?[0-9]+$' or score::text::numeric not between -2147483648 and 2147483647 then raise exception 'Invalid Spades score.' using errcode='22023'; end if;
  end loop;
  winning_score:=(_result->'scores'->>winner)::integer;
  if winning_score<target or exists(select 1 from jsonb_array_elements(_result->'scores') with ordinality s(value,n) where n<>winner+1 and value::text::integer>=winning_score) then raise exception 'Only a unique full-match winner earns a reward.' using errcode='22023'; end if;
  for player in select value from jsonb_array_elements(_result->'players') loop
    if jsonb_typeof(player)<>'object' or (select count(*) from jsonb_object_keys(player))<>3 or
      exists(select 1 from jsonb_object_keys(player) k where k not in ('user_id','bot','level')) or jsonb_typeof(player->'bot') is distinct from 'boolean' then raise exception 'Invalid player evidence.' using errcode='22023'; end if;
    if (player->>'bot')::boolean then
      if player->'user_id' is distinct from 'null'::jsonb or player->>'level' is null or player->>'level' not in ('easy','normal','hard') then raise exception 'Invalid computer evidence.' using errcode='22023'; end if;
      bots:=bots+1; levels:=array_append(levels,player->>'level');
    else
      uid:=(player->>'user_id')::uuid;
      if uid is null or uid=any(users) or player->'level' is distinct from 'null'::jsonb or not exists(select 1 from auth.users u where u.id=uid) then raise exception 'Every human needs a distinct verified account.' using errcode='22023'; end if;
      users:=array_append(users,uid); humans:=humans+1;
      if (case when variant='teams' then seat%2 else seat end)=winner then winners:=array_append(winners,uid); end if;
    end if;
    seat:=seat+1;
  end loop;
  if cardinality(winners)=0 then raise exception 'Computer winners do not earn wallet points.' using errcode='22023'; end if;
  if mode='online' then
    if bots<>0 or humans<>4 then raise exception 'Online rewards require four verified humans.' using errcode='22023'; end if;
    tier:='humans'; amount:=150;
  else
    if humans<>1 or bots<>3 then raise exception 'Computer rewards require one verified human.' using errcode='22023'; end if;
    tier:=case when 'hard'=any(levels) then 'hard' when 'normal'=any(levels) then 'normal' else 'easy' end;
    amount:=case tier when 'hard' then 120 when 'normal' then 70 else 40 end;
  end if;
  select array_agg(w order by w) into winners from unnest(winners) w;
  source:='spades:win:'||match_id::text;
  insert into public.spades_reward_receipts(match_id,user_ids,tier,amount,result,source) values(match_id,winners,tier,amount,_result,source) on conflict do nothing returning spades_reward_receipts.match_id into added;
  if added is null then
    select * into prior from public.spades_reward_receipts r where r.match_id=reward.match_id;
    if not found or prior.result is distinct from _result then raise exception 'Spades receipt conflicts with this result.' using errcode='22023'; end if;
    return jsonb_build_object('match_id',match_id,'user_ids',prior.user_ids,'tier',prior.tier,'amount',prior.amount,'source',prior.source,'already_credited',true);
  end if;
  perform 1 from public.wallets w where w.user_id=any(winners) order by w.user_id for update;
  get diagnostics wallet_count=row_count;
  if wallet_count<>cardinality(winners) then raise exception 'A winner wallet is unavailable.' using errcode='22023'; end if;
  foreach uid in array winners loop
    insert into public.point_awards(user_id,source,amount,spades_tier) values(uid,source,amount,tier) on conflict do nothing returning id into added;
    if added is null then raise exception 'A Spades award already exists without a receipt.' using errcode='22023'; end if;
    update public.wallets w set spades_points=w.spades_points+amount,lifetime_points=w.lifetime_points+amount where w.user_id=uid;
  end loop;
  return jsonb_build_object('match_id',match_id,'user_ids',winners,'tier',tier,'amount',amount,'source',source,'already_credited',false);
end; $$;
revoke all on function public.credit_spades_match(jsonb) from public,anon,authenticated;
grant execute on function public.credit_spades_match(jsonb) to service_role;
commit;
