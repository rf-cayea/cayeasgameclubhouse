-- Initial schema for this checkout. Apply to a new Supabase project after review.
-- Existing projects must reconcile their schema before applying this migration.
-- Staff membership is administered through trusted SQL only, never user metadata.
begin;

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

commit;
