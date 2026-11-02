-- Execute against the migrated local test database as its owner with psql -v ON_ERROR_STOP=1.
-- Every fixture and action is rolled back; no external Supabase account is used.
\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
begin;
create temp table clubhouse_assertions(passed integer not null);
insert into clubhouse_assertions values (0);
grant select, update on clubhouse_assertions to anon, authenticated;

create function pg_temp.assert_true(value boolean, message text) returns void
language plpgsql as $$
begin
  if value is distinct from true then raise exception 'ASSERTION FAILED: %', message; end if;
  update pg_temp.clubhouse_assertions set passed = passed + 1;
end;
$$;
create function pg_temp.expect_error(statement text, expected_state text) returns void
language plpgsql as $$
declare actual_state text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate;
    if actual_state <> expected_state then
      raise exception 'Expected SQLSTATE %, got % for %: %', expected_state, actual_state, statement, sqlerrm;
    end if;
    update pg_temp.clubhouse_assertions set passed = passed + 1;
    return;
  end;
  raise exception 'Expected SQLSTATE %, but command succeeded: %', expected_state, statement;
end;
$$;

insert into auth.users(id) values
  ('11111111-1111-1111-1111-111111111111'), -- ordinary reporter / wallet buyer
  ('22222222-2222-2222-2222-222222222222'), -- reported player / insufficient wallet
  ('33333333-3333-3333-3333-333333333333'), -- admin
  ('44444444-4444-4444-4444-444444444444'), -- moderator
  ('55555555-5555-5555-5555-555555555555'); -- exact-price wallet buyer
insert into public.clubhouse_staff(user_id, role) values
  ('33333333-3333-3333-3333-333333333333', 'admin'),
  ('44444444-4444-4444-4444-444444444444', 'moderator');
update public.profiles set display_name = 'Reported Name' where user_id = '22222222-2222-2222-2222-222222222222';
update public.wallets set rummy_points = 1000, points = 7, f3_points = 123, lifetime_points = 9999
  where user_id = '11111111-1111-1111-1111-111111111111';
update public.wallets set rummy_points = 799 where user_id = '22222222-2222-2222-2222-222222222222';
update public.wallets set rummy_points = 800 where user_id = '55555555-5555-5555-5555-555555555555';
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
insert into public.clubhouse_posts(id, user_id, body) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', auth.uid(), 'Snapshot post one'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000002', auth.uid(), 'Snapshot post two'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000003', auth.uid(), 'Unaffected post');
insert into public.clubhouse_chat(id, user_id, body) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-000000000001', auth.uid(), 'Existing chat message'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-000000000002', auth.uid(), 'Chat message to hide');

-- Ordinary members cannot grant roles, write balances, forge evidence, read raw
-- names/content, review queues, or select another member's wallet.
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select pg_temp.assert_true(public.moderation_role() is null, 'ordinary member has no role');
select pg_temp.expect_error($sql$insert into public.clubhouse_staff(user_id, role) values (auth.uid(), 'admin')$sql$, '42501');
select pg_temp.expect_error($sql$select nextval('public.clubhouse_invalidations_id_seq')$sql$, '42501');
select pg_temp.expect_error($sql$select setval('public.moderation_audit_id_seq',1)$sql$, '42501');
select pg_temp.expect_error($sql$update public.wallets set rummy_points = 1000000 where user_id = auth.uid()$sql$, '42501');
select pg_temp.expect_error($sql$select * from public.profiles$sql$, '42501');
select pg_temp.expect_error($sql$select body from public.clubhouse_posts$sql$, '42501');
select pg_temp.expect_error($sql$select * from public.player_reports$sql$, '42501');
select pg_temp.expect_error($sql$insert into public.player_reports(reporter_id,reported_user_id,context,reason,evidence) values (auth.uid(),auth.uid(),'player','fake','{}')$sql$, '42501');
select pg_temp.expect_error($sql$select * from public.moderation_reports()$sql$, '42501');
select pg_temp.expect_error($sql$select public.moderate_report(gen_random_uuid(),'ban_chat','unauthorized')$sql$, '42501');
select pg_temp.assert_true((select count(*) from public.wallets) = 1, 'wallet RLS exposes only self');
select pg_temp.assert_true((select count(*) from public.lounge_feed('post', 50)) = 3, 'visible post feed');
select pg_temp.expect_error($sql$insert into public.clubhouse_posts(user_id,body) values ('22222222-2222-2222-2222-222222222222','forged author')$sql$, '42501');
select pg_temp.expect_error($sql$insert into public.clubhouse_chat(user_id,body) values (auth.uid(),'shit')$sql$, '22023');
select pg_temp.expect_error($sql$select public.submit_player_report('11111111-1111-1111-1111-111111111111','player',null,'myself')$sql$, '22023');
select pg_temp.expect_error($sql$select public.submit_player_report('55555555-5555-5555-5555-555555555555','post','aaaaaaaa-aaaa-aaaa-aaaa-000000000001','forged target')$sql$, '22023');
select pg_temp.expect_error($sql$select public.submit_player_report('22222222-2222-2222-2222-222222222222','player',null,'x')$sql$, '22023');
select public.submit_player_report('22222222-2222-2222-2222-222222222222','post','aaaaaaaa-aaaa-aaaa-aaaa-000000000001','Hide reported content') as hide_report \gset
select public.submit_player_report('22222222-2222-2222-2222-222222222222','post','aaaaaaaa-aaaa-aaaa-aaaa-000000000002','Delete reported content') as delete_report \gset
select public.submit_player_report('22222222-2222-2222-2222-222222222222','chat','bbbbbbbb-bbbb-bbbb-bbbb-000000000002','Hide this chat message') as chat_report \gset
select pg_temp.expect_error($sql$select public.submit_player_report('22222222-2222-2222-2222-222222222222','post','aaaaaaaa-aaaa-aaaa-aaaa-000000000001','Duplicate pending report')$sql$, '23505');

-- Catalog price, exact debit, ownership idempotency, and unrelated balances.
select pg_temp.assert_true((select price from public.store_catalog where id = 'rummy-jokers') = 800, 'Joker Mode costs 800');
select pg_temp.assert_true(public.purchase_store_item('rummy-jokers')->>'balance' = '200', 'purchase deducts exactly 800');
select pg_temp.assert_true(public.purchase_store_item('rummy-jokers')->>'already_owned' = 'true', 'duplicate purchase returns owned');
select pg_temp.assert_true((select rummy_points = 200 and points = 7 and f3_points = 123 and lifetime_points = 9999
  and owned = array['rummy-jokers']::text[] from public.wallets), 'purchase changes only selected balance and ownership');
select pg_temp.expect_error($sql$update public.store_catalog set price=1 where id='rummy-jokers'$sql$, '42501');
select pg_temp.expect_error($sql$select public.purchase_store_item('not-an-item')$sql$, '22023');
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select pg_temp.expect_error($sql$select public.purchase_store_item('rummy-jokers')$sql$, '22023');
select pg_temp.assert_true((select rummy_points = 799 and owned = '{}'::text[] from public.wallets), 'insufficient purchase has no side effects');
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
select pg_temp.assert_true(public.purchase_store_item('rummy-jokers')->>'balance' = '0', 'exact-price wallet can purchase');

-- Staff can review trusted snapshots, not client-provided evidence.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select pg_temp.assert_true(public.moderation_role() = 'moderator', 'moderator role detected');
select pg_temp.assert_true((select evidence->>'body' = 'Snapshot post one' and evidence->>'author_name' = 'Reported Name'
  from public.moderation_reports() where id = :'hide_report'), 'server captures real report snapshot');
select pg_temp.expect_error(format('select public.moderate_report(%L,%L,%L)', :'hide_report', 'hide_content', 'x'), '22023');
select pg_temp.assert_true(public.moderate_report(:'hide_report', 'hide_content', 'Confirmed hidden content')->>'status' = 'resolved', 'hide action resolves report');
select pg_temp.expect_error(format('select public.moderate_report(%L,%L,%L)', :'hide_report', 'delete_content', 'second action'), '40001');
select resolved_at::text as hidden_version from public.moderation_reports('resolved') where id = :'hide_report' \gset
select public.moderate_report(:'hide_report', 'mute_chat', 'Follow-up chat mute', :'hidden_version');
select pg_temp.expect_error(format('select public.moderate_report(%L,%L,%L,%L)', :'hide_report', 'unmute_chat', 'stale follow-up', :'hidden_version'), '40001');
select resolved_at::text as muted_version from public.moderation_reports('resolved') where id = :'hide_report' \gset
select pg_temp.assert_true(:'muted_version'::timestamptz > :'hidden_version'::timestamptz, 'follow-up advances exact resolution version');
select public.moderate_report(:'hide_report', 'unmute_chat', 'Follow-up unmute', :'muted_version');
select public.moderate_report(:'delete_report', 'delete_content', 'Confirmed delete content');
select public.moderate_report(:'chat_report', 'hide_content', 'Confirmed hidden chat');
select pg_temp.assert_true((select evidence->>'body' = 'Snapshot post two' from public.moderation_reports('resolved') where id = :'delete_report'), 'evidence survives deletion');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select pg_temp.assert_true((select count(*) from public.lounge_feed('post',50)) = 1, 'hidden and deleted posts leave public feed');
select pg_temp.assert_true((select count(*) from public.lounge_feed('chat',50)) = 1, 'hidden chat leaves public feed');

-- Player actions alter current projection immediately; snapshots stay immutable.
select public.submit_player_report('22222222-2222-2222-2222-222222222222','player',null,'Flag display name') as flag_report \gset
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select public.moderate_report(:'flag_report','flag_name','Flagged inappropriate name');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select pg_temp.assert_true((select bool_and(author_name = 'Player') from public.lounge_feed('post',50)), 'flag masks all old post names');
select pg_temp.assert_true((select bool_and(author_name = 'Player') from public.lounge_feed('chat',50)), 'flag masks all old chat names');
select public.submit_player_report('22222222-2222-2222-2222-222222222222','player',null,'Reset display name') as reset_report \gset
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select public.moderate_report(:'reset_report','reset_name','Reset name to Player');
select pg_temp.assert_true((select evidence->>'author_name' = 'Reported Name' from public.moderation_reports('resolved') where id = :'hide_report'), 'name reset does not overwrite evidence');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select public.submit_player_report('22222222-2222-2222-2222-222222222222','player',null,'Mute chat user') as mute_report \gset
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select public.moderate_report(:'mute_report','mute_chat','Muted for 24 hours');
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select pg_temp.assert_true((public.lounge_permissions()->>'muted_until')::timestamptz > now(), 'permissions expose current mute');
select pg_temp.expect_error($sql$insert into public.clubhouse_chat(user_id,body) values (auth.uid(),'cannot send while muted')$sql$, '42501');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select public.submit_player_report('22222222-2222-2222-2222-222222222222','player',null,'Lift chat mute') as unmute_report \gset
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select public.moderate_report(:'unmute_report','unmute_chat','Mute no longer required');
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
insert into public.clubhouse_chat(user_id,body) values (auth.uid(),'Chat after unmute');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select public.submit_player_report('22222222-2222-2222-2222-222222222222','player',null,'Ban chat user') as ban_report \gset
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select public.moderate_report(:'ban_report','ban_chat','Repeated chat violations');
select pg_temp.assert_true((select count(*) from public.lounge_feed('chat',50)) = 0, 'chat ban removes all old target messages');
select pg_temp.assert_true((select count(*) from public.lounge_feed('post',50)) = 1, 'chat ban does not silently ban posts');
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select pg_temp.assert_true(public.lounge_permissions()->>'chat_banned' = 'true', 'permissions expose chat ban');
select pg_temp.expect_error($sql$insert into public.clubhouse_chat(user_id,body) values (auth.uid(),'cannot send while banned')$sql$, '42501');
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select resolved_at::text as ban_version from public.moderation_reports('resolved') where id = :'ban_report' \gset
select public.moderate_report(:'ban_report','unban_chat','Chat appeal accepted', :'ban_version');
select pg_temp.assert_true((select count(*) from public.lounge_feed('chat',50)) = 2, 'unban restores unhidden messages');

-- Staff protections, self-review protection, and dismissed report state.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select public.submit_player_report('33333333-3333-3333-3333-333333333333','player',null,'Review staff member') as staff_report \gset
select public.submit_player_report('44444444-4444-4444-4444-444444444444','player',null,'Review moderator') as self_report \gset
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
select pg_temp.expect_error(format('select public.moderate_report(%L,%L,%L)', :'staff_report', 'ban_chat', 'staff target'), '42501');
select pg_temp.expect_error(format('select public.moderate_report(%L,%L,%L)', :'self_report', 'dismiss', 'self review'), '42501');
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select pg_temp.assert_true(public.moderation_role() = 'admin', 'admin role detected');
select public.moderate_report(:'self_report','dismiss','No policy violation found');
select pg_temp.assert_true((select count(*) from public.moderation_reports('dismissed')) = 1, 'dismissed queue contains reviewed report');
select pg_temp.expect_error($sql$delete from public.moderation_audit$sql$, '42501');
select pg_temp.expect_error($sql$insert into public.clubhouse_invalidations default values$sql$, '42501');

-- Anonymous clients can see the catalog, not member feeds, profiles, reports,
-- purchase RPC, or safe invalidations.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.assert_true((select price from public.store_catalog where id='rummy-jokers')=800, 'anonymous catalog price is 800');
select pg_temp.expect_error($sql$select * from public.lounge_feed('post',50)$sql$, '42501');
select pg_temp.expect_error($sql$select public.purchase_store_item('rummy-jokers')$sql$, '42501');
select pg_temp.expect_error($sql$select * from public.clubhouse_invalidations$sql$, '42501');

reset role;
select pg_temp.assert_true((select count(*) from public.store_purchases) = 2, 'only two successful unique purchases');
select pg_temp.assert_true((select count(*) from public.moderation_audit) = 12, 'every successful moderation and follow-up action is audited once');
select pg_temp.assert_true((select count(*) from public.clubhouse_invalidations) >= 20, 'safe cache invalidations emitted for changes');
select pg_temp.assert_true(exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='clubhouse_invalidations'), 'safe invalidations are published');
select 'PASS: ' || passed || ' SQL assertions; role/RLS isolation, trusted evidence, moderation/audit/follow-up actions, current feed filtering, mute/ban enforcement, 800-point purchases and idempotency'
  from pg_temp.clubhouse_assertions;
rollback;
