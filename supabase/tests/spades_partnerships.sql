-- Actual PostgreSQL permissions and 800-point permanent partnership ownership.
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
begin;
create temp table partnership_assertions(passed integer not null); insert into partnership_assertions values(0);
grant select,update on partnership_assertions to anon,authenticated;
create function pg_temp.check_true(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'ASSERTION FAILED: %',message; end if; update pg_temp.partnership_assertions set passed=passed+1; end; $$;
create function pg_temp.check_error(statement text,expected text default '22023') returns void language plpgsql as $$
declare actual text;
begin begin execute statement; exception when others then
  get stacked diagnostics actual=returned_sqlstate; if actual<>expected then raise exception 'Expected %, got %: %',expected,actual,sqlerrm; end if;
  update pg_temp.partnership_assertions set passed=passed+1; return; end;
  raise exception 'Expected error %, command succeeded: %',expected,statement;
end; $$;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
update public.wallets set spades_points=799,rummy_points=800,f3_points=40,points=55,lifetime_points=1200 where user_id='10000000-0000-4000-8000-000000000001';
update public.wallets set spades_points=800,rummy_points=900,f3_points=60,points=70,lifetime_points=1500 where user_id='10000000-0000-4000-8000-000000000002';
select pg_temp.check_true(not exists(select 1 from public.wallets where 'spades-partnerships'=any(owned)),'New wallets do not get a free partnership unlock');
select pg_temp.check_error($q$update public.store_catalog set price=799 where id='spades-partnerships'$q$,'23514');
select pg_temp.check_error($q$update public.store_catalog set currency='rummy_points' where id='spades-partnerships'$q$,'23514');
set local role anon;
select pg_temp.check_true((select price=800 and currency='spades_points' and slot is null from public.store_catalog where id='spades-partnerships'),'Public catalog exposes exact price and non-cosmetic status');
select pg_temp.check_error($q$select public.purchase_store_item('spades-partnerships')$q$,'42501');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.check_error($q$select public.purchase_store_item('spades-partnerships')$q$);
select pg_temp.check_true((select spades_points=799 and rummy_points=800 and owned='{}'::text[] from public.wallets),'799 Spades points and 800 Rummy points cannot buy the unlock');
select pg_temp.check_error($q$update public.wallets set owned=array['spades-partnerships'] where user_id=auth.uid()$q$,'42501');
select pg_temp.check_error($q$insert into public.store_purchases(user_id,item_id,price,currency) values(auth.uid(),'spades-partnerships',0,'spades_points')$q$,'42501');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.check_true(public.purchase_store_item('spades-partnerships')->>'balance'='0','Exactly 800 Spades points buys permanent partnerships');
select pg_temp.check_true((select spades_points=0 and owned=array['spades-partnerships']::text[] and rummy_points=900 and f3_points=60 and points=70 and lifetime_points=1500 from public.wallets),'Only Spades spendable balance and ownership change');
select pg_temp.check_true(public.purchase_store_item('spades-partnerships')->>'already_owned'='true','Retry stays owned even at zero balance');
select pg_temp.check_error($q$select public.equip_store_item('spades_deck','spades-partnerships')$q$);
select pg_temp.check_error($q$select public.equip_store_item('spades_table','spades-partnerships')$q$);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select pg_temp.check_true((select not 'spades-partnerships'=any(owned) from public.wallets),'Another account does not inherit the unlock');
reset role;
select pg_temp.check_true((select count(*)=1 and min(price)=800 and min(currency)='spades_points' from public.store_purchases where item_id='spades-partnerships'),'One successful purchase record at exactly 800');
select pg_temp.check_true(not exists(select 1 from public.point_awards),'Purchasing does not fabricate earned points');
select 'PASS: '||passed||' partnership SQL assertions; exact 800-point pricing, 799 rejection, account isolation, permanent ownership, and duplicate purchase protection' from partnership_assertions;
rollback;
