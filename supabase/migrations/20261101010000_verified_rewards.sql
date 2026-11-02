-- Only the trusted game service can turn a completed result into earned points.
begin;

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
commit;
