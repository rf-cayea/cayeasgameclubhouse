-- Cayea's Game Clubhouse: initial Supabase database setup
-- Run ONCE in a NEW, empty Supabase project's SQL Editor.
-- All source migrations are combined into one transaction.
-- Existing projects require a schema review before using this script.

begin;

-- Source: 20261101000000_clubhouse_moderation_store.sql
-- SHA-256: aead26d19930cf1d03cb3a8a3d9744bd389da3c1328bd06f6db396f238a2c844
-- Initial schema for this checkout. Apply to a new Supabase project after review.
-- Existing projects must reconcile their schema before applying this migration.
-- Staff membership is administered through trusted SQL only, never user metadata.

create table public.clubhouse_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'moderator'))
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player' check (char_length(display_name) between 2 and 40),
  name_flagged boolean not null default false,
  chat_banned boolean not null default false,
  muted_until timestamptz,
  created_at timestamptz not null default now()
);

create table public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  points integer not null default 0 check (points >= 0),
  f3_points integer not null default 0 check (f3_points >= 0),
  rummy_points integer not null default 0 check (rummy_points >= 0),
  lifetime_points integer not null default 0 check (lifetime_points >= 0),
  owned text[] not null default '{}',
  equipped jsonb not null default '{}',
  pending_perks jsonb not null default '{}'
);

create table public.point_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  amount integer not null check (amount > 0),
  rummy_tier text check (rummy_tier in ('humans', 'hard', 'normal', 'easy')),
  created_at timestamptz not null default now(),
  unique (user_id, source)
);

create table public.clubhouse_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  hidden_at timestamptz
);

create table public.clubhouse_chat (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 300),
  created_at timestamptz not null default now(),
  hidden_at timestamptz
);
create index clubhouse_posts_recent on public.clubhouse_posts(created_at desc, id desc);
create index clubhouse_chat_recent on public.clubhouse_chat(created_at desc, id desc);

create table public.player_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null,
  reported_user_id uuid not null,
  context text not null check (context in ('post', 'chat', 'player')),
  context_id uuid,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  evidence jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution text,
  check ((context = 'player' and context_id is null) or (context <> 'player' and context_id is not null))
);
-- A deleted message cannot erase its evidence; IDs intentionally do not cascade.
create unique index player_reports_one_pending_per_reporter
  on public.player_reports(reporter_id, context, (coalesce(context_id, reported_user_id)))
  where status = 'pending';
create index player_reports_queue on public.player_reports(status, created_at desc, id desc);

create table public.moderation_audit (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.player_reports(id),
  actor_id uuid not null,
  target_user_id uuid not null,
  action text not null,
  note text not null check (char_length(btrim(note)) between 3 and 1000),
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);

-- These events carry no names, report details, user IDs, or content. Clients
-- invalidate cached sanitized feeds even when hiding a row makes it unreadable.
create table public.clubhouse_invalidations (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

create table public.store_catalog (
  id text primary key,
  name text not null,
  price integer not null check (price > 0),
  currency text not null check (currency = 'rummy_points'),
  enabled boolean not null default true
);
insert into public.store_catalog(id, name, price, currency)
values ('rummy-jokers', 'Joker Mode', 800, 'rummy_points');

create table public.store_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references public.store_catalog(id),
  price integer not null,
  currency text not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_id)
);

alter table public.clubhouse_staff enable row level security;
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.point_awards enable row level security;
alter table public.clubhouse_posts enable row level security;
alter table public.clubhouse_chat enable row level security;
alter table public.player_reports enable row level security;
alter table public.moderation_audit enable row level security;
alter table public.clubhouse_invalidations enable row level security;
alter table public.store_catalog enable row level security;
alter table public.store_purchases enable row level security;

revoke all on public.clubhouse_staff, public.profiles, public.wallets,
  public.point_awards, public.clubhouse_posts, public.clubhouse_chat,
  public.player_reports, public.moderation_audit, public.clubhouse_invalidations,
  public.store_catalog, public.store_purchases from public, anon, authenticated;
revoke all on sequence public.moderation_audit_id_seq, public.clubhouse_invalidations_id_seq
  from public, anon, authenticated;

grant select on public.wallets, public.point_awards to authenticated;
create policy wallets_read_own on public.wallets for select to authenticated using (user_id = auth.uid());
create policy awards_read_own on public.point_awards for select to authenticated using (user_id = auth.uid());

-- Content bodies are readable only through lounge_feed, which derives the
-- current safe name. Limited ID reads support the existing own-post delete UI.
grant insert (user_id, body) on public.clubhouse_posts, public.clubhouse_chat to authenticated;
grant select (id, user_id), delete on public.clubhouse_posts to authenticated;
create policy posts_read_own_ids on public.clubhouse_posts for select to authenticated using (user_id = auth.uid());
create policy posts_create_own on public.clubhouse_posts for insert to authenticated with check (user_id = auth.uid());
create policy chat_create_own on public.clubhouse_chat for insert to authenticated with check (user_id = auth.uid());
create policy posts_delete_own on public.clubhouse_posts for delete to authenticated using (user_id = auth.uid());

grant select on public.clubhouse_invalidations to authenticated;
create policy invalidations_members on public.clubhouse_invalidations for select to authenticated using (auth.uid() is not null);
grant select on public.store_catalog to anon, authenticated;
create policy catalog_public on public.store_catalog for select to anon, authenticated using (enabled);

create function public.clubhouse_initialize_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id) values (new.id) on conflict do nothing;
  insert into public.wallets(user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger clubhouse_initialize_user after insert on auth.users
  for each row execute function public.clubhouse_initialize_user();
insert into public.profiles(user_id) select id from auth.users on conflict do nothing;
insert into public.wallets(user_id) select id from auth.users on conflict do nothing;

create function public.clubhouse_invalidate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.clubhouse_invalidations default values;
  return null;
end;
$$;
create trigger clubhouse_posts_invalidate after insert or update or delete on public.clubhouse_posts
  for each statement execute function public.clubhouse_invalidate();
create trigger clubhouse_chat_invalidate after insert or update or delete on public.clubhouse_chat
  for each statement execute function public.clubhouse_invalidate();
create trigger clubhouse_profiles_invalidate after insert or update or delete on public.profiles
  for each statement execute function public.clubhouse_invalidate();
create trigger clubhouse_reports_invalidate after insert or update on public.player_reports
  for each statement execute function public.clubhouse_invalidate();
create trigger clubhouse_staff_invalidate after insert or update or delete on public.clubhouse_staff
  for each statement execute function public.clubhouse_invalidate();

create function public.clubhouse_check_content() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  member public.profiles%rowtype;
begin
  if auth.uid() is null or new.user_id <> auth.uid() then
    raise exception 'Sign in as the content author.' using errcode = '42501';
  end if;
  select * into strict member from public.profiles where user_id = auth.uid() for share;
  if tg_table_name = 'clubhouse_chat' and (member.chat_banned or member.muted_until > now()) then
    raise exception 'Your chat access is restricted.' using errcode = '42501';
  end if;
  new.body := btrim(new.body);
  if new.body ~* '\m(fuck(ing|ed|er|ers)?|shit(ty|s)?|bitch(es)?|cunt(s)?)\M' then
    raise exception 'Please use clean language.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger clubhouse_posts_check before insert on public.clubhouse_posts
  for each row execute function public.clubhouse_check_content();
create trigger clubhouse_chat_check before insert on public.clubhouse_chat
  for each row execute function public.clubhouse_check_content();

create function public.moderation_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.clubhouse_staff where user_id = auth.uid();
$$;

create function public.lounge_permissions() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  select jsonb_build_object('chat_banned', p.chat_banned, 'muted_until', p.muted_until,
    'name_flagged', p.name_flagged) into result from public.profiles p where p.user_id = auth.uid();
  if result is null then raise exception 'Member profile is unavailable.'; end if;
  return result;
end;
$$;

create function public.lounge_feed(_kind text, _limit integer default 50)
returns table (id uuid, user_id uuid, author_name text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if _kind not in ('post', 'chat') or _kind is null or _limit is null or _limit < 1 or _limit > 100 then
    raise exception 'Invalid feed request.' using errcode = '22023';
  end if;
  if _kind = 'post' then
    return query select c.id, c.user_id,
      case when p.name_flagged then 'Player' else p.display_name end,
      c.body, c.created_at
      from public.clubhouse_posts c join public.profiles p on p.user_id = c.user_id
      where c.hidden_at is null order by c.created_at desc, c.id desc limit _limit;
  else
    return query select c.id, c.user_id,
      case when p.name_flagged then 'Player' else p.display_name end,
      c.body, c.created_at
      from public.clubhouse_chat c join public.profiles p on p.user_id = c.user_id
      where c.hidden_at is null and not p.chat_banned
      order by c.created_at desc, c.id desc limit _limit;
  end if;
end;
$$;

create function public.submit_player_report(_reported_user_id uuid, _context text, _context_id uuid, _reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target public.profiles%rowtype;
  content_body text;
  content_created timestamptz;
  report_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if _reported_user_id = auth.uid() then raise exception 'You cannot report yourself.' using errcode = '22023'; end if;
  if _context is null or _context not in ('post', 'chat', 'player') or
    _reason is null or char_length(btrim(_reason)) not between 3 and 500 then
    raise exception 'A valid report and reason (3–500 characters) are required.' using errcode = '22023';
  end if;
  select * into target from public.profiles where user_id = _reported_user_id;
  if not found then raise exception 'Player no longer exists.' using errcode = '22023'; end if;
  if _context = 'post' then
    select body, created_at into content_body, content_created from public.clubhouse_posts
      where id = _context_id and user_id = _reported_user_id and hidden_at is null;
    if not found then raise exception 'Reported post is unavailable.' using errcode = '22023'; end if;
  elsif _context = 'chat' then
    select body, created_at into content_body, content_created from public.clubhouse_chat
      where id = _context_id and user_id = _reported_user_id and hidden_at is null and not target.chat_banned;
    if not found then raise exception 'Reported chat message is unavailable.' using errcode = '22023'; end if;
  else
    if _context_id is not null then raise exception 'Player reports do not have a content ID.' using errcode = '22023'; end if;
    content_created := target.created_at;
  end if;
  insert into public.player_reports(reporter_id, reported_user_id, context, context_id, reason, evidence)
    values (auth.uid(), _reported_user_id, _context, _context_id, btrim(_reason),
      jsonb_build_object('author_name', target.display_name, 'body', content_body,
        'created_at', content_created, 'user_id', _reported_user_id, 'context', _context,
        'context_id', _context_id)) returning id into report_id;
  return report_id;
exception when unique_violation then
  raise exception 'You already have a pending report for this player or content.' using errcode = '23505';
end;
$$;

create function public.moderation_reports(_status text default 'pending', _offset integer default 0, _limit integer default 50)
returns table (id uuid, context text, context_id uuid, reported_user_id uuid, reporter_id uuid,
  reason text, evidence jsonb, status text, created_at timestamptz, resolved_at timestamptz,
  resolved_by uuid, resolution text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.moderation_role() is null then raise exception 'Moderator access required.' using errcode = '42501'; end if;
  if _status is null or _status not in ('pending', 'resolved', 'dismissed') or
    _offset is null or _offset < 0 or _limit is null or _limit < 1 or _limit > 100 then
    raise exception 'Invalid report queue request.' using errcode = '22023';
  end if;
  return query select r.id, r.context, r.context_id, r.reported_user_id, r.reporter_id,
    r.reason, r.evidence, r.status, r.created_at, r.resolved_at, r.resolved_by, r.resolution
    from public.player_reports r where r.status = _status
    order by r.created_at desc, r.id desc offset _offset limit _limit;
end;
$$;

create function public.moderate_report(_report_id uuid, _action text, _note text,
  _expected_resolved_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_role text := public.moderation_role();
  report public.player_reports%rowtype;
  old_state jsonb;
  new_state jsonb;
  result_status text;
  resolution_version timestamptz;
begin
  if actor_role is null then raise exception 'Moderator access required.' using errcode = '42501'; end if;
  if _action is null or _action not in ('hide_content', 'delete_content', 'mute_chat', 'unmute_chat',
    'ban_chat', 'unban_chat', 'flag_name', 'reset_name', 'dismiss') then
    raise exception 'Invalid moderation action.' using errcode = '22023';
  end if;
  if _note is null or char_length(btrim(_note)) not between 3 and 1000 then
    raise exception 'An audit note (3–1000 characters) is required.' using errcode = '22023';
  end if;
  select * into report from public.player_reports where id = _report_id for update;
  if not found then raise exception 'Report not found.' using errcode = '22023'; end if;
  if (report.status = 'pending' and _expected_resolved_at is not null) or
    (report.status <> 'pending' and (_expected_resolved_at is null or _expected_resolved_at <> report.resolved_at)) then
    raise exception 'This report changed. Refresh before taking another action.' using errcode = '40001';
  end if;
  if report.reported_user_id = actor then raise exception 'You cannot review a report about yourself.' using errcode = '42501'; end if;
  if actor_role <> 'admin' and exists (select 1 from public.clubhouse_staff where user_id = report.reported_user_id) then
    raise exception 'Only an admin may review reports about staff.' using errcode = '42501';
  end if;
  if _action in ('hide_content', 'delete_content') then
    if report.context = 'player' then raise exception 'This report has no content to remove.' using errcode = '22023'; end if;
    if report.context = 'post' then
      select to_jsonb(c) into old_state from public.clubhouse_posts c
        where c.id = report.context_id and c.user_id = report.reported_user_id for update;
      if not found then raise exception 'The reported post has already been deleted.' using errcode = '22023'; end if;
      if _action = 'hide_content' then
        update public.clubhouse_posts set hidden_at = now() where id = report.context_id;
        select to_jsonb(c) into new_state from public.clubhouse_posts c where c.id = report.context_id;
      else
        delete from public.clubhouse_posts where id = report.context_id;
        new_state := jsonb_build_object('deleted', true);
      end if;
    else
      select to_jsonb(c) into old_state from public.clubhouse_chat c
        where c.id = report.context_id and c.user_id = report.reported_user_id for update;
      if not found then raise exception 'The reported message has already been deleted.' using errcode = '22023'; end if;
      if _action = 'hide_content' then
        update public.clubhouse_chat set hidden_at = now() where id = report.context_id;
        select to_jsonb(c) into new_state from public.clubhouse_chat c where c.id = report.context_id;
      else
        delete from public.clubhouse_chat where id = report.context_id;
        new_state := jsonb_build_object('deleted', true);
      end if;
    end if;
  elsif _action = 'dismiss' then
    old_state := '{}'::jsonb;
    new_state := '{}'::jsonb;
  else
    select to_jsonb(p) into old_state from public.profiles p where p.user_id = report.reported_user_id for update;
    if not found then raise exception 'The reported player no longer exists.' using errcode = '22023'; end if;
    update public.profiles set
      muted_until = case when _action = 'mute_chat' then now() + interval '24 hours'
        when _action = 'unmute_chat' then null else muted_until end,
      chat_banned = case when _action = 'ban_chat' then true when _action = 'unban_chat' then false else chat_banned end,
      name_flagged = case when _action = 'flag_name' then true when _action = 'reset_name' then false else name_flagged end,
      display_name = case when _action = 'reset_name' then 'Player' else display_name end
      where user_id = report.reported_user_id;
    select to_jsonb(p) into new_state from public.profiles p where p.user_id = report.reported_user_id;
  end if;
  result_status := case when _action = 'dismiss' then 'dismissed' else 'resolved' end;
  resolution_version := greatest(clock_timestamp(), coalesce(report.resolved_at + interval '1 microsecond', '-infinity'::timestamptz));
  update public.player_reports set status = result_status, resolved_at = resolution_version, resolved_by = actor,
    resolution = _action || ': ' || btrim(_note) where id = report.id;
  insert into public.moderation_audit(report_id, actor_id, target_user_id, action, note, before_state, after_state)
    values (report.id, actor, report.reported_user_id, _action, btrim(_note), old_state, new_state);
  return jsonb_build_object('report_id', report.id, 'status', result_status, 'action', _action,
    'resolved_at', resolution_version);
end;
$$;

create function public.purchase_store_item(_item_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  item public.store_catalog%rowtype;
  wallet public.wallets%rowtype;
begin
  if actor is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  select * into item from public.store_catalog where id = _item_id and enabled for share;
  if not found then raise exception 'Store item is unavailable.' using errcode = '22023'; end if;
  select * into wallet from public.wallets where user_id = actor for update;
  if not found then raise exception 'Your wallet is unavailable.' using errcode = '22023'; end if;
  if item.id = any(wallet.owned) then
    return jsonb_build_object('item_id', item.id, 'owned', true, 'already_owned', true,
      'balance', wallet.rummy_points, 'currency', item.currency, 'price', item.price);
  end if;
  if wallet.rummy_points < item.price then raise exception 'Not enough Rummy+ points.' using errcode = '22023'; end if;
  update public.wallets set rummy_points = rummy_points - item.price,
    owned = array_append(owned, item.id) where user_id = actor;
  insert into public.store_purchases(user_id, item_id, price, currency)
    values (actor, item.id, item.price, item.currency);
  return jsonb_build_object('item_id', item.id, 'owned', true, 'already_owned', false,
    'balance', wallet.rummy_points - item.price, 'currency', item.currency, 'price', item.price);
end;
$$;

-- Functions are not callable by PUBLIC/anon. A browser can neither insert a
-- staff role, forge evidence, write wallet balances nor bypass an audit action.
revoke all on function public.clubhouse_initialize_user(), public.clubhouse_invalidate(),
  public.clubhouse_check_content(), public.moderation_role(), public.lounge_permissions(),
  public.lounge_feed(text, integer), public.submit_player_report(uuid, text, uuid, text),
  public.moderation_reports(text, integer, integer), public.moderate_report(uuid, text, text, timestamptz),
  public.purchase_store_item(text) from public, anon, authenticated;
grant execute on function public.moderation_role(), public.lounge_permissions(),
  public.lounge_feed(text, integer), public.submit_player_report(uuid, text, uuid, text),
  public.moderation_reports(text, integer, integer), public.moderate_report(uuid, text, text, timestamptz),
  public.purchase_store_item(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.clubhouse_invalidations;
  end if;
end;
$$;

-- Source: 20261101010000_verified_rewards.sql
-- SHA-256: 45dbc395577e5f4c2b0b2200c374de64d6510d6abcd93e2fa9637e44bb3d9798
-- Only the trusted game service can turn a completed result into earned points.

create table public.rummy_reward_receipts (
  match_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  tier text not null check (tier in ('easy','normal','hard','humans')),
  amount integer not null check (amount in (40,70,120,150)),
  source text not null unique,
  result jsonb not null,
  completed_at timestamptz not null,
  credited_at timestamptz not null default now()
);
alter table public.rummy_reward_receipts enable row level security;
revoke all on public.rummy_reward_receipts from public,anon,authenticated;

create function public.credit_rummy_match(_result jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
<<reward>>
declare
  match_id uuid;
  winner_id uuid;
  winner_index integer;
  winner_score integer;
  mode text;
  variant text;
  tier text;
  amount integer;
  target integer;
  completed timestamptz;
  source text;
  participant jsonb;
  player_id uuid;
  users uuid[] := '{}';
  human_count integer := 0;
  bot_count integer := 0;
  levels text[] := '{}';
  i integer := 0;
  added uuid;
  prior public.rummy_reward_receipts%rowtype;
begin
  if _result is null or jsonb_typeof(_result)<>'object' or _result->'version' is distinct from '1'::jsonb or
    (select count(*) from jsonb_object_keys(_result))<>7 or
    exists(select 1 from jsonb_object_keys(_result) k where k not in ('version','match_id','variant','mode','winner_index','participants','completed_at')) then
    raise exception 'Invalid verified reward result.' using errcode='22023';
  end if;
  match_id := (_result->>'match_id')::uuid;
  variant := _result->>'variant';
  mode := _result->>'mode';
  if variant is null or variant not in ('classic','gin','r500') or mode is null or mode not in ('bot','online') or
    jsonb_typeof(_result->'participants')<>'array' or jsonb_array_length(_result->'participants') not between 2 and 4 or
    jsonb_typeof(_result->'winner_index')<>'number' or (_result->>'winner_index')!~'^[0-3]$' then
    raise exception 'Invalid match participants or variant.' using errcode='22023';
  end if;
  if variant='gin' and jsonb_array_length(_result->'participants')<>2 then raise exception 'Gin requires two players.' using errcode='22023'; end if;
  winner_index := (_result->>'winner_index')::integer;
  if winner_index>=jsonb_array_length(_result->'participants') then raise exception 'Invalid winner.' using errcode='22023'; end if;
  completed := (_result->>'completed_at')::timestamptz;
  if match_id is null or completed is null or completed>now()+interval '5 minutes' then raise exception 'Invalid match completion.' using errcode='22023'; end if;
  target := case when variant='r500' then 500 else 100 end;
  for participant in select value from jsonb_array_elements(_result->'participants') loop
    if jsonb_typeof(participant)<>'object' or (select count(*) from jsonb_object_keys(participant))<>4 or
      exists(select 1 from jsonb_object_keys(participant) k where k not in ('user_id','bot','level','score')) or
      jsonb_typeof(participant->'bot')<>'boolean' or jsonb_typeof(participant->'score')<>'number' or
      (participant->>'score')!~'^-?[0-9]+$' or (participant->>'score')::numeric not between -2147483648 and 2147483647 then
      raise exception 'Invalid participant evidence.' using errcode='22023';
    end if;
    if (participant->>'bot')::boolean then
      if participant->'user_id'<>'null'::jsonb or participant->>'level' is null or participant->>'level' not in ('easy','normal','hard') then raise exception 'Invalid computer evidence.' using errcode='22023'; end if;
      bot_count := bot_count+1; levels := array_append(levels,participant->>'level');
    else
      player_id := (participant->>'user_id')::uuid;
      if player_id is null or participant->'level'<>'null'::jsonb or player_id=any(users) then raise exception 'Every human must have a distinct verified account.' using errcode='22023'; end if;
      users := array_append(users,player_id); human_count := human_count+1;
    end if;
    if i=winner_index then
      if (participant->>'bot')::boolean then raise exception 'Computer winners do not receive wallet points.' using errcode='22023'; end if;
      winner_id := player_id;
      winner_score := (participant->>'score')::integer;
    end if;
    i := i+1;
  end loop;
  if winner_score<target or exists(select 1 from jsonb_array_elements(_result->'participants') with ordinality p(value,n)
    where n<>winner_index+1 and (value->>'score')::integer>=winner_score) then
    raise exception 'Only a unique full-match winner earns a reward.' using errcode='22023';
  end if;
  if mode='online' then
    if bot_count<>0 or human_count<2 then raise exception 'Online reward requires verified human opponents.' using errcode='22023'; end if;
    tier := 'humans'; amount := 150;
  else
    if human_count<>1 or bot_count<1 then raise exception 'Computer reward requires one verified human.' using errcode='22023'; end if;
    tier := case when 'hard'=any(levels) then 'hard' when 'normal'=any(levels) then 'normal' else 'easy' end;
    amount := case tier when 'hard' then 120 when 'normal' then 70 else 40 end;
  end if;
  source := 'rummy:win:'||match_id::text;
  insert into public.rummy_reward_receipts(match_id,user_id,tier,amount,source,result,completed_at)
    values(match_id,winner_id,tier,amount,source,_result,completed) on conflict do nothing returning user_id into added;
  if added is null then
    select * into prior from public.rummy_reward_receipts r where r.match_id=reward.match_id;
    if not found or prior.user_id<>winner_id or prior.result is distinct from _result then
      raise exception 'Match reward conflicts with its existing receipt.' using errcode='22023';
    end if;
    return jsonb_build_object('match_id',match_id,'user_id',winner_id,'tier',prior.tier,'amount',prior.amount,'source',prior.source,'already_credited',true);
  end if;
  perform 1 from public.wallets w where w.user_id=winner_id for update;
  if not found then raise exception 'Winner wallet is unavailable.' using errcode='22023'; end if;
  insert into public.point_awards(user_id,source,amount,rummy_tier) values(winner_id,source,amount,tier) on conflict do nothing returning id into added;
  if added is null then raise exception 'An award already exists without its matching reward receipt.' using errcode='22023'; end if;
  update public.wallets w set rummy_points=w.rummy_points+amount,lifetime_points=w.lifetime_points+amount where w.user_id=winner_id;
  return jsonb_build_object('match_id',match_id,'user_id',winner_id,'tier',tier,'amount',amount,'source',source,'already_credited',false);
end;
$$;
revoke all on function public.credit_rummy_match(jsonb) from public,anon,authenticated;
grant execute on function public.credit_rummy_match(jsonb) to service_role;

create table public.point_conversions (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  game text not null check(game in ('faith-3','rummy')),
  amount integer not null check(amount>0 and amount%10=0),
  cash integer not null check(cash>0),
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
alter table public.point_conversions enable row level security;
revoke all on public.point_conversions from public,anon,authenticated;

create function public.convert_game_points(_game text,_amount integer,_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  wallet public.wallets%rowtype;
  prior public.point_conversions%rowtype;
  cash integer;
begin
  if actor is null then raise exception 'Sign in to convert points.' using errcode='42501'; end if;
  if _game is null or _game not in ('faith-3','rummy') or _amount is null or _amount<=0 or _amount%10<>0 or _request_id is null then
    raise exception 'Convert a positive multiple of ten game points.' using errcode='22023';
  end if;
  select * into wallet from public.wallets where user_id=actor for update;
  if not found then raise exception 'Your wallet is unavailable.' using errcode='22023'; end if;
  select * into prior from public.point_conversions where user_id=actor and request_id=_request_id;
  if found then
    if prior.game<>_game or prior.amount<>_amount then raise exception 'Conversion ID already belongs to another conversion.' using errcode='22023'; end if;
    return jsonb_build_object('cash',prior.cash,'amount',prior.amount,'already_converted',true);
  end if;
  if (case when _game='rummy' then wallet.rummy_points else wallet.f3_points end)<_amount then raise exception 'Not enough game points.' using errcode='22023'; end if;
  cash := (_amount/10)*7;
  update public.wallets set rummy_points=rummy_points-case when _game='rummy' then _amount else 0 end,
    f3_points=f3_points-case when _game='faith-3' then _amount else 0 end,points=points+cash where user_id=actor;
  insert into public.point_conversions(user_id,request_id,game,amount,cash) values(actor,_request_id,_game,_amount,cash);
  return jsonb_build_object('cash',cash,'amount',_amount,'already_converted',false);
end;
$$;
revoke all on function public.convert_game_points(text,integer,uuid) from public,anon,authenticated;
grant execute on function public.convert_game_points(text,integer,uuid) to authenticated;

-- Source: 20261101020000_spades_collection_rewards.sql
-- SHA-256: a74a2604e001c3d2e50de5bd87ec269f744a5257266e9a05ef5421dd837e8271
-- Spades wallets, permanent cosmetics, and trusted four-player match rewards.

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

-- Source: 20261102000000_spades_partnership_unlock.sql
-- SHA-256: 4569fbbd88d449e2cd1746bd4d6fe2ffab87914a7c1c31c32d8225b7439335c9
-- Permanent per-player access. Existing owners and wallets are not granted access.

insert into public.store_catalog(id,name,price,currency,slot)
values('spades-partnerships','Spades Partnerships',800,'spades_points',null);
alter table public.store_catalog add constraint spades_partnerships_fixed_price
  check(id<>'spades-partnerships' or (price=800 and currency='spades_points' and slot is null));
-- purchase_store_item already locks the caller's wallet, charges its catalog
-- currency once, and records permanent ownership. No new client write grants.

-- Source: 20261102010000_faith3_skins.sql
-- SHA-256: 8e1f3d11cd4737c01dcfdd6f15e18bf70da36a90f7206cd3658316b6a6dcc28f
-- Upgrade an existing Clubhouse database. No wallet balances or ownership reset.

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
