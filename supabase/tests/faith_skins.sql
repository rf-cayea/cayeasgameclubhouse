\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
begin;
create temp table skin_assertions(passed integer not null); insert into skin_assertions values(0);
grant select,update on skin_assertions to anon,authenticated;
create function pg_temp.check_true(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'ASSERTION FAILED: %',message; end if; update pg_temp.skin_assertions set passed=passed+1; end; $$;
create function pg_temp.check_error(statement text,expected text default '22023') returns void language plpgsql as $$
declare actual text;
begin begin execute statement; exception when others then
 get stacked diagnostics actual=returned_sqlstate; if actual<>expected then raise exception 'Expected %, got %: %',expected,actual,sqlerrm; end if;
 update pg_temp.skin_assertions set passed=passed+1; return; end;
 raise exception 'Expected error %, command succeeded: %',expected,statement;
end; $$;
insert into auth.users(id) values('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
update public.wallets set points=299,rummy_points=2000,spades_points=3000,f3_points=500,lifetime_points=6000,equipped='{"spades_deck":"spades-deck-classic"}' where user_id='20000000-0000-4000-8000-000000000001';
select pg_temp.check_error($q$update public.store_catalog set price=299 where id='faith3-skin-celestial'$q$,'23514');
select pg_temp.check_error($q$update public.store_catalog set slot=null where id='faith3-skin-jade'$q$,'23514');
set local role anon;
select pg_temp.check_true((select count(*)=3 and min(price)=300 and max(price)=600 from public.store_catalog where slot='faith3_skin' and currency='points'),'All three permanent skins have public Cash prices');
select pg_temp.check_error($q$select public.purchase_store_item('faith3-skin-celestial')$q$,'42501');
select pg_temp.check_error($q$select public.equip_store_item('faith3_skin','faith3-classic')$q$,'42501');
set local role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select pg_temp.check_error($q$select public.purchase_store_item('faith3-skin-celestial')$q$);
select pg_temp.check_error($q$select public.equip_store_item('faith3_skin','faith3-skin-celestial')$q$);
select pg_temp.check_error($q$update public.wallets set owned=array['faith3-skin-celestial'] where user_id=auth.uid()$q$,'42501');
select pg_temp.check_error($q$update public.store_catalog set price=1 where id='faith3-skin-celestial'$q$,'42501');
select pg_temp.check_true((select points=299 and rummy_points=2000 and spades_points=3000 and f3_points=500 and owned='{}'::text[] from public.wallets),'Insufficient Cash never spends another currency');
reset role;
update public.wallets set points=1350 where user_id='20000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.check_true(public.purchase_store_item('faith3-skin-celestial')->>'balance'='1050','Celestial debits exactly 300 Cash');
select pg_temp.check_true(public.purchase_store_item('faith3-skin-celestial')->>'already_owned'='true','Retry is idempotent');
select pg_temp.check_true(public.equip_store_item('faith3_skin','faith3-skin-celestial')->>'slot'='faith3_skin','Owned skin equips');
select pg_temp.check_true((select points=1050 and equipped->>'faith3_skin'='faith3-skin-celestial' and equipped->>'spades_deck'='spades-deck-classic' from public.wallets),'Equipping preserves Cash and other cosmetic slots');
select pg_temp.check_error($q$select public.equip_store_item('spades_deck','faith3-skin-celestial')$q$);
select pg_temp.check_error($q$select public.equip_store_item('faith3_skin','spades-deck-classic')$q$);
select pg_temp.check_true(public.purchase_store_item('faith3-skin-jade')->>'balance'='600','Jade debits exactly 450 Cash');
select pg_temp.check_true(public.purchase_store_item('faith3-skin-rose')->>'balance'='0','Rose debits exactly 600 Cash');
select pg_temp.check_true(public.purchase_store_item('faith3-skin-rose')->>'already_owned'='true','Owned skin retries work at zero Cash');
select pg_temp.check_true((select points=0 and rummy_points=2000 and spades_points=3000 and f3_points=500 and lifetime_points=6000 and cardinality(owned)=3 from public.wallets),'Purchases preserve every other currency and lifetime earnings');
select pg_temp.check_true(public.equip_store_item('faith3_skin','faith3-classic')->>'item_id'='faith3-classic','Original illumination can be restored for free');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select pg_temp.check_error($q$select public.equip_store_item('faith3_skin','faith3-skin-rose')$q$);
select pg_temp.check_true((select owned='{}'::text[] and equipped='{}'::jsonb from public.wallets),'Another account cannot inherit ownership or equipment');
reset role;
select pg_temp.check_true((select count(*)=3 and sum(price)=1350 and bool_and(currency='points') from public.store_purchases where user_id='20000000-0000-4000-8000-000000000001'),'Exactly one receipt exists per skin at its real price');
select pg_temp.check_true(not exists(select 1 from public.point_awards),'Purchases never mint point awards');
select 'PASS: '||passed||' Faith 3 skin SQL assertions; Cash-only debit, ownership, equipment, account isolation, replay protection and existing wallet preservation' from skin_assertions;
rollback;
