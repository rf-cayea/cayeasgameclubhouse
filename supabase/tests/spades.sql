\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
begin;
create temp table spades_assertions(passed integer not null); insert into spades_assertions values(0);
grant select,update on spades_assertions to anon,authenticated,service_role;
create function pg_temp.check_true(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'ASSERTION FAILED: %',message; end if; update pg_temp.spades_assertions set passed=passed+1; end; $$;
create function pg_temp.check_error(statement text,expected text default '22023') returns void language plpgsql as $$
declare actual text;
begin begin execute statement; exception when others then
  get stacked diagnostics actual=returned_sqlstate; if actual<>expected then raise exception 'Expected %, got %: %',expected,actual,sqlerrm; end if;
  update pg_temp.spades_assertions set passed=passed+1; return; end;
  raise exception 'Expected error %, command succeeded: %',expected,statement;
end; $$;
create function pg_temp.result(match uuid,level text default 'normal',mode text default 'bot',variant text default 'teams') returns jsonb language sql as $$
select jsonb_build_object('version',1,'match_id',match,'mode',mode,'variant',variant,'target',500,'winner',0,'completed_at','2020-01-01T00:00:00Z',
  'scores',case when variant='teams' then '[510,400]'::jsonb else '[510,200,300,400]'::jsonb end,
  'players',(select jsonb_agg(jsonb_build_object('user_id',case when mode='online' or seat=1 then ('00000000-0000-4000-8000-'||lpad(seat::text,12,'0')) else null end,
    'bot',mode='bot' and seat<>1,'level',case when mode='bot' and seat<>1 then level else null end) order by seat) from generate_series(1,4) seat));
$$;
insert into auth.users(id) select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,4) i;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select pg_temp.check_error($q$select public.credit_spades_match(pg_temp.result('10000000-0000-4000-8000-000000000001'))$q$,'42501');
select pg_temp.check_error('select * from public.spades_reward_receipts','42501');
select pg_temp.check_error('update public.wallets set spades_points=999999','42501');
set local role service_role;
select pg_temp.check_true(public.credit_spades_match(pg_temp.result('10000000-0000-4000-8000-000000000001','easy'))->>'amount'='40','Easy pays 40');
select pg_temp.check_true(public.credit_spades_match(pg_temp.result('10000000-0000-4000-8000-000000000002'))->>'amount'='70','Normal pays 70');
select pg_temp.check_true(public.credit_spades_match(pg_temp.result('10000000-0000-4000-8000-000000000003','hard'))->>'amount'='120','Hard pays 120');
select pg_temp.check_true(jsonb_array_length(public.credit_spades_match(pg_temp.result('10000000-0000-4000-8000-000000000004',null,'online'))->'user_ids')=2,'Both opposite partners earn a full online reward');
select pg_temp.check_true(jsonb_array_length(public.credit_spades_match(pg_temp.result('10000000-0000-4000-8000-000000000005',null,'online','solo'))->'user_ids')=1,'Solo pays only one winner');
select pg_temp.check_true(public.credit_spades_match(pg_temp.result('10000000-0000-4000-8000-000000000004',null,'online'))->>'already_credited'='true','Duplicate match returns existing team receipt');
select pg_temp.check_error($q$select public.credit_spades_match(jsonb_set(pg_temp.result('10000000-0000-4000-8000-000000000004',null,'online'),'{winner}','1'))$q$);
select pg_temp.check_error($q$select public.credit_spades_match(jsonb_set(pg_temp.result('10000000-0000-4000-8000-000000000006'),'{winner}','1'))$q$);
select pg_temp.check_error($q$select public.credit_spades_match(jsonb_set(pg_temp.result('10000000-0000-4000-8000-000000000006'),'{scores}','[510,510]'))$q$);
select pg_temp.check_error($q$select public.credit_spades_match(jsonb_set(pg_temp.result('10000000-0000-4000-8000-000000000006'),'{scores}','[499,400]'))$q$);
select pg_temp.check_error($q$select public.credit_spades_match(jsonb_set(pg_temp.result('10000000-0000-4000-8000-000000000006'),'{target}','5'))$q$);
select pg_temp.check_error($q$select public.credit_spades_match(jsonb_set(pg_temp.result('10000000-0000-4000-8000-000000000006'),'{mode}','"online"'))$q$);
select pg_temp.check_error($q$select public.credit_spades_match(jsonb_set(pg_temp.result('10000000-0000-4000-8000-000000000006'),'{players,0,user_id}','null'))$q$);
select pg_temp.check_error($q$select public.credit_spades_match(jsonb_set(pg_temp.result('10000000-0000-4000-8000-000000000006',null,'online'),'{players,2,user_id}','"00000000-0000-4000-8000-000000000001"'))$q$);
select pg_temp.check_error($q$select public.credit_spades_match(pg_temp.result('10000000-0000-4000-8000-000000000006')||'{"amount":999}')$q$);
select pg_temp.check_error($q$select public.credit_spades_match(jsonb_set(pg_temp.result('10000000-0000-4000-8000-000000000006'),'{version}','null'))$q$);
select pg_temp.check_error($q$select public.credit_spades_match(null)$q$);
reset role;
select pg_temp.check_true((select spades_points=530 and lifetime_points=530 and points=0 and rummy_points=0 from public.wallets where user_id='00000000-0000-4000-8000-000000000001'),'Winner receives only Spades and lifetime points');
select pg_temp.check_true((select spades_points=150 and lifetime_points=150 from public.wallets where user_id='00000000-0000-4000-8000-000000000003'),'Winning teammate receives the full reward');
select pg_temp.check_true((select spades_points=0 from public.wallets where user_id='00000000-0000-4000-8000-000000000002'),'Opposing team earns zero');
select pg_temp.check_true((select count(*)=6 and sum(amount)=680 from public.point_awards),'One award per winner per match');
select pg_temp.check_true((select count(*)=5 from public.spades_reward_receipts),'Invalid outcomes leave no receipts');

update public.wallets set spades_points=1000,rummy_points=800,lifetime_points=1200 where user_id='00000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select pg_temp.check_error($q$select public.equip_store_item('spades_deck','spades-deck-atlas')$q$);
select pg_temp.check_true(public.purchase_store_item('spades-deck-atlas')->>'balance'='650','Deck costs its server catalog price');
select pg_temp.check_true(public.purchase_store_item('spades-deck-atlas')->>'already_owned'='true','Deck retry does not double debit');
select pg_temp.check_true(public.equip_store_item('spades_deck','spades-deck-atlas')->>'item_id'='spades-deck-atlas','Owned deck equips');
select pg_temp.check_error($q$select public.equip_store_item('spades_table','spades-deck-atlas')$q$);
select pg_temp.check_true(public.purchase_store_item('spades-table-atlas')->>'balance'='150','Table includes matching background for 500');
select pg_temp.check_true(public.equip_store_item('spades_table','spades-table-atlas')->>'slot'='spades_table','Owned venue equips');
select pg_temp.check_error($q$select public.purchase_store_item('spades-deck-deco')$q$);
select pg_temp.check_true((select rummy_points=800 and spades_points=150 and lifetime_points=1200 and points=0 and equipped->>'spades_deck'='spades-deck-atlas' from public.wallets),'Purchases affect only Spades balance and ownership');
select pg_temp.check_true(public.equip_store_item('spades_deck','spades-deck-classic')->>'item_id'='spades-deck-classic','Complimentary design can be restored');
select pg_temp.check_error($q$select public.equip_store_item('faith3_skin','spades-deck-atlas')$q$);
select pg_temp.check_true(public.convert_game_points('spades',100,'20000000-0000-4000-8000-000000000001')->>'cash'='70','Spades points convert at 10 to 7');
select pg_temp.check_true(public.convert_game_points('spades',100,'20000000-0000-4000-8000-000000000001')->>'already_converted'='true','Conversion retry is safe');
select pg_temp.check_true((select spades_points=50 and rummy_points=800 and lifetime_points=1200 and points=70 from public.wallets),'Conversion preserves other game and lifetime balances');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select pg_temp.check_error($q$select public.equip_store_item('spades_table','spades-table-atlas')$q$);
set local role anon;
select pg_temp.check_error($q$select public.equip_store_item('spades_deck','spades-deck-classic')$q$,'42501');
select pg_temp.check_error($q$select public.credit_spades_match(pg_temp.result('10000000-0000-4000-8000-000000000006'))$q$,'42501');
select pg_temp.check_true((select count(*)=8 from public.store_catalog where currency='spades_points' and slot is not null),'Four venues and four decks are visible in the catalog');
reset role;
select 'PASS: '||passed||' Spades SQL assertions; team/solo credits, service-only minting, permanent ownership, equipment, currency isolation, conversion, and 800-point Joker preservation' from spades_assertions;
rollback;
