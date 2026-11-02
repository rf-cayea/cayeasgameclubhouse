-- Real PostgreSQL assertions. All fixture writes are rolled back.
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
begin;
create temp table reward_assertions(passed integer not null);
insert into reward_assertions values(0);
grant select,update on reward_assertions to anon,authenticated,service_role;
create function pg_temp.check_true(value boolean,message text) returns void language plpgsql as $$
begin
  if value is distinct from true then raise exception 'ASSERTION FAILED: %',message; end if;
  update pg_temp.reward_assertions set passed=passed+1;
end; $$;
create function pg_temp.check_error(statement text,expected text default '22023') returns void language plpgsql as $$
declare actual text;
begin
  begin execute statement;
  exception when others then
    get stacked diagnostics actual=returned_sqlstate;
    if actual<>expected then raise exception 'Expected %, got %: %',expected,actual,sqlerrm; end if;
    update pg_temp.reward_assertions set passed=passed+1; return;
  end;
  raise exception 'Expected error %, command succeeded: %',expected,statement;
end; $$;
create function pg_temp.result(match uuid,level text default 'normal',mode text default 'bot',variant text default 'classic',score integer default 105) returns jsonb language sql as $$
select jsonb_build_object('version',1,'match_id',match,'variant',variant,'mode',mode,'winner_index',0,'completed_at','2026-11-01T00:00:00Z',
  'participants',jsonb_build_array(
    jsonb_build_object('user_id','11111111-1111-4111-8111-111111111111','bot',false,'level',null,'score',score),
    jsonb_build_object('user_id',case when mode='online' then '22222222-2222-4222-8222-222222222222' else null end,'bot',mode<>'online','level',case when mode='bot' then level else null end,'score',0)));
$$;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');

-- Browser callers cannot mint credits or edit ledgers directly.
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select pg_temp.check_error($q$select public.credit_rummy_match(pg_temp.result('10000000-0000-4000-8000-000000000001'))$q$,'42501');
select pg_temp.check_error($q$insert into public.point_awards(user_id,source,amount) values(auth.uid(),'rummy:win:fake',999)$q$,'42501');
select pg_temp.check_error($q$update public.wallets set rummy_points=999999 where user_id=auth.uid()$q$,'42501');
select pg_temp.check_error('select * from public.rummy_reward_receipts','42501');
select pg_temp.check_error('select * from public.point_conversions','42501');
set local role anon;
select pg_temp.check_error($q$select public.credit_rummy_match(pg_temp.result('10000000-0000-4000-8000-000000000001'))$q$,'42501');
select pg_temp.check_error($q$select public.convert_game_points('rummy',10,'20000000-0000-4000-8000-000000000001')$q$,'42501');

set local role service_role;
select pg_temp.check_true(public.credit_rummy_match(pg_temp.result('10000000-0000-4000-8000-000000000001','easy'))->>'amount'='40','Easy reward fixed at 40');
select pg_temp.check_true(public.credit_rummy_match(pg_temp.result('10000000-0000-4000-8000-000000000002'))->>'amount'='70','Normal reward fixed at 70');
select pg_temp.check_true(public.credit_rummy_match(pg_temp.result('10000000-0000-4000-8000-000000000003','hard'))->>'amount'='120','Hard reward fixed at 120');
select pg_temp.check_true(public.credit_rummy_match(pg_temp.result('10000000-0000-4000-8000-000000000004',null,'online'))->>'amount'='150','Human reward fixed at 150');
select pg_temp.check_true(public.credit_rummy_match(pg_temp.result('10000000-0000-4000-8000-000000000005','normal','bot','gin'))->>'amount'='70','Gin full match credits');
select pg_temp.check_true(public.credit_rummy_match(pg_temp.result('10000000-0000-4000-8000-000000000006','normal','bot','r500',505))->>'amount'='70','R500 requires 500 target');
select pg_temp.check_true(public.credit_rummy_match(pg_temp.result('10000000-0000-4000-8000-000000000002'))->>'already_credited'='true','Duplicate returns existing receipt');
select pg_temp.check_error($q$select public.credit_rummy_match(jsonb_set(pg_temp.result('10000000-0000-4000-8000-000000000002'),'{participants,0,score}','110'))$q$);
select pg_temp.check_error($q$select public.credit_rummy_match(pg_temp.result('10000000-0000-4000-8000-000000000007','normal','bot','r500',105))$q$);
select pg_temp.check_error($q$select public.credit_rummy_match(pg_temp.result('10000000-0000-4000-8000-000000000007','normal','bot','classic',99))$q$);
select pg_temp.check_error($q$select public.credit_rummy_match(jsonb_set(pg_temp.result('10000000-0000-4000-8000-000000000007'),'{participants,1,score}','105'))$q$);
select pg_temp.check_error($q$select public.credit_rummy_match(jsonb_set(pg_temp.result('10000000-0000-4000-8000-000000000007'),'{winner_index}','1'))$q$);
select pg_temp.check_error($q$select public.credit_rummy_match(jsonb_set(pg_temp.result('10000000-0000-4000-8000-000000000007',null,'online'),'{participants,1,user_id}','null'))$q$);
select pg_temp.check_error($q$select public.credit_rummy_match(jsonb_set(pg_temp.result('10000000-0000-4000-8000-000000000007',null,'online'),'{participants,1,user_id}','"11111111-1111-4111-8111-111111111111"'))$q$);
select pg_temp.check_error($q$select public.credit_rummy_match(jsonb_set(pg_temp.result('10000000-0000-4000-8000-000000000007'),'{mode}','"online"'))$q$);
select pg_temp.check_error($q$select public.credit_rummy_match(pg_temp.result('10000000-0000-4000-8000-000000000007','unknown'))$q$);
select pg_temp.check_error($q$select public.credit_rummy_match(jsonb_set(pg_temp.result('10000000-0000-4000-8000-000000000007'),'{mode}','"local"'))$q$);
select pg_temp.check_error($q$select public.credit_rummy_match(pg_temp.result('10000000-0000-4000-8000-000000000007')||'{"amount":999}')$q$);
select pg_temp.check_error($q$select public.credit_rummy_match(jsonb_set(pg_temp.result('10000000-0000-4000-8000-000000000007'),'{version}','null'))$q$);
select pg_temp.check_error($q$select public.credit_rummy_match(jsonb_set(pg_temp.result('10000000-0000-4000-8000-000000000007'),'{completed_at}','"infinity"'))$q$);
select pg_temp.check_error($q$select public.credit_rummy_match(null)$q$);

reset role;
select pg_temp.check_true((select rummy_points=520 and lifetime_points=520 and points=0 and f3_points=0 from public.wallets where user_id='11111111-1111-4111-8111-111111111111'),'Credit changes only earned Rummy and lifetime balances');
select pg_temp.check_true((select count(*)=6 and sum(amount)=520 and count(distinct source)=6 from public.point_awards),'One award per completed match');
select pg_temp.check_true((select rummy_points=0 and lifetime_points=0 from public.wallets where user_id='22222222-2222-4222-8222-222222222222'),'Loser receives no wallet credit');
select pg_temp.check_true((select count(*)=6 from public.rummy_reward_receipts),'Invalid credits leave no receipts');

-- Conversions debit only the caller's chosen balance and never earn more lifetime points.
update public.wallets set f3_points=50 where user_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select pg_temp.check_true(public.convert_game_points('rummy',100,'20000000-0000-4000-8000-000000000001')->>'cash'='70','100 Rummy points become 70 Cash');
select pg_temp.check_true(public.convert_game_points('rummy',100,'20000000-0000-4000-8000-000000000001')->>'already_converted'='true','Retry is idempotent');
select pg_temp.check_error($q$select public.convert_game_points('rummy',10,'20000000-0000-4000-8000-000000000001')$q$);
select pg_temp.check_error($q$select public.convert_game_points('faith-3',100,'20000000-0000-4000-8000-000000000001')$q$);
select pg_temp.check_true(public.convert_game_points('faith-3',50,'20000000-0000-4000-8000-000000000002')->>'cash'='35','Faith points use the same rate');
select pg_temp.check_error($q$select public.convert_game_points('rummy',1000,'20000000-0000-4000-8000-000000000003')$q$);
select pg_temp.check_error($q$select public.convert_game_points('rummy',-10,'20000000-0000-4000-8000-000000000003')$q$);
select pg_temp.check_error($q$select public.convert_game_points('rummy',0,'20000000-0000-4000-8000-000000000003')$q$);
select pg_temp.check_error($q$select public.convert_game_points('rummy',11,'20000000-0000-4000-8000-000000000003')$q$);
select pg_temp.check_error($q$select public.convert_game_points('cash',10,'20000000-0000-4000-8000-000000000003')$q$);
select pg_temp.check_error($q$select public.convert_game_points('rummy',10,null)$q$);
select pg_temp.check_true((select rummy_points=420 and f3_points=0 and points=105 and lifetime_points=520 from public.wallets),'No duplicate debit or conversion lifetime inflation');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select pg_temp.check_error($q$select public.convert_game_points('rummy',100,'20000000-0000-4000-8000-000000000001')$q$);
select pg_temp.check_true((select points=0 and rummy_points=0 from public.wallets),'Request ID cannot expose another account conversion');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.check_error($q$select public.convert_game_points('rummy',10,'20000000-0000-4000-8000-000000000001')$q$,'42501');

reset role;
-- Verified match receipts can buy the 800-point Joker unlock.
select public.credit_rummy_match(pg_temp.result(('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid)) from generate_series(1,6) i;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select pg_temp.check_true(public.purchase_store_item('rummy-jokers')->>'balance'='40','Earned credits purchase Joker Mode for exactly 800');
select pg_temp.check_true((select points=105 and lifetime_points=940 and owned @> array['rummy-jokers'] from public.wallets),'Purchase preserves Cash and lifetime totals');
reset role;
select 'PASS: '||passed||' reward SQL assertions; service-only minting, fixed rates, duplicate prevention, atomic conversions, and 800-point Joker purchase' from reward_assertions;
rollback;
