-- Buzzer Beat schema. Paste into Supabase Dashboard > SQL Editor > Run.
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE where possible.
--
-- Model: the host browser is the game authority. Phones submit actions via
-- submit_action() which stamps server time + a global sequence number; the host
-- reads them over Realtime (postgres_changes). The host publishes public state
-- via Realtime broadcast and stores a snapshot in rooms.public_state for reconnects.

create extension if not exists pgcrypto;

-- ---------- tables ----------

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_uid uuid not null,
  phase text not null default 'LOBBY',
  public_state jsonb,
  max_players int not null default 8,
  allow_late_join boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  uid uuid not null,
  display_name text not null,
  colour text not null,
  avatar_id text not null,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, uid)
);

create table if not exists public.actions (
  seq bigserial primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_uid uuid not null,
  client_id text not null,
  kind text not null,
  payload jsonb not null,
  server_received_at timestamptz not null default now(),
  unique (room_id, client_id)
);
create index if not exists actions_room_seq on public.actions (room_id, seq);
create index if not exists actions_uid_time on public.actions (player_uid, server_received_at);

create table if not exists public.question_packs (
  id uuid primary key default gen_random_uuid(),
  owner_uid uuid not null,
  title text not null,
  settings jsonb not null default '{}'::jsonb,
  questions jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------- row level security ----------

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.actions enable row level security;
alter table public.question_packs enable row level security;

drop policy if exists rooms_host_all on public.rooms;
create policy rooms_host_all on public.rooms
  for all to authenticated
  using (host_uid = auth.uid())
  with check (host_uid = auth.uid());

drop policy if exists players_select on public.players;
create policy players_select on public.players
  for select to authenticated
  using (
    uid = auth.uid()
    or exists (select 1 from public.rooms r where r.id = room_id and r.host_uid = auth.uid())
  );

-- Only the room host can read actions (and so receive them over Realtime).
drop policy if exists actions_host_select on public.actions;
create policy actions_host_select on public.actions
  for select to authenticated
  using (exists (select 1 from public.rooms r where r.id = room_id and r.host_uid = auth.uid()));

drop policy if exists packs_owner_all on public.question_packs;
create policy packs_owner_all on public.question_packs
  for all to authenticated
  using (owner_uid = auth.uid())
  with check (owner_uid = auth.uid());

-- ---------- functions ----------

-- Room codes: 4 letters, no ambiguous characters (no I, L, O, 0, 1).
create or replace function public.create_room()
returns table (room_id uuid, room_code text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ';
  candidate text;
  new_id uuid;
  attempt int := 0;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  -- One open room per host: close older ones.
  update rooms set closed_at = now() where host_uid = auth.uid() and closed_at is null;
  loop
    attempt := attempt + 1;
    candidate := '';
    for i in 1..4 loop
      candidate := candidate || substr(alphabet, 1 + (get_byte(gen_random_bytes(1), 0) % length(alphabet)), 1);
    end loop;
    begin
      insert into rooms (code, host_uid) values (candidate, auth.uid()) returning id into new_id;
      exit;
    exception when unique_violation then
      -- Reuse codes of rooms closed/abandoned for > 6 hours.
      delete from rooms where code = candidate and (closed_at is not null or updated_at < now() - interval '6 hours');
      if attempt > 20 then raise exception 'could not allocate room code'; end if;
    end;
  end loop;
  return query select new_id, candidate;
end $$;

-- Reclaim an existing room after a host refresh.
create or replace function public.resume_room(p_code text)
returns uuid
language sql security definer set search_path = public, extensions as $$
  select id from rooms where code = upper(p_code) and host_uid = auth.uid() and closed_at is null;
$$;

-- Anyone with the code can read the public snapshot (contains no answers).
create or replace function public.get_room_state(p_code text)
returns jsonb
language sql security definer set search_path = public, extensions as $$
  select jsonb_build_object('exists', true, 'closed', closed_at is not null, 'state', public_state)
  from rooms where code = upper(p_code)
  order by created_at desc limit 1;
$$;

create or replace function public.join_room(p_code text, p_name text, p_colour text, p_avatar text, p_client_id text)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  r rooms%rowtype;
  existing uuid;
  n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into r from rooms where code = upper(p_code) and closed_at is null order by created_at desc limit 1;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  select id into existing from players where room_id = r.id and uid = auth.uid();
  if existing is null then
    select count(*) into n from players where room_id = r.id;
    if n >= r.max_players then raise exception 'ROOM_FULL'; end if;
    if r.phase <> 'LOBBY' and not r.allow_late_join then raise exception 'GAME_STARTED'; end if;
    insert into players (room_id, uid, display_name, colour, avatar_id)
    values (r.id, auth.uid(), left(coalesce(nullif(trim(p_name), ''), 'Player'), 16), p_colour, p_avatar);
  else
    update players set last_seen_at = now() where id = existing;
  end if;

  insert into actions (room_id, player_uid, client_id, kind, payload)
  values (r.id, auth.uid(), p_client_id, 'join',
          jsonb_build_object('kind', 'join', 'name', left(p_name, 16), 'colour', p_colour, 'avatar', p_avatar))
  on conflict (room_id, client_id) do nothing;
  return auth.uid();
end $$;

create or replace function public.submit_action(p_code text, p_client_id text, p_payload jsonb)
returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare
  r_id uuid;
  recent int;
  new_seq bigint;
  k text := p_payload->>'kind';
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if k not in ('ready', 'answer', 'buzz', 'target', 'tick', 'tap', 'leave') then raise exception 'BAD_ACTION'; end if;
  if pg_column_size(p_payload) > 2000 then raise exception 'BAD_ACTION'; end if;

  select rm.id into r_id from rooms rm
    join players p on p.room_id = rm.id and p.uid = auth.uid()
    where rm.code = upper(p_code) and rm.closed_at is null
    order by rm.created_at desc limit 1;
  if r_id is null then raise exception 'NOT_IN_ROOM'; end if;

  -- Rate limit: 12 actions per player per 2 seconds.
  select count(*) into recent from actions
    where player_uid = auth.uid() and server_received_at > now() - interval '2 seconds';
  if recent >= 12 then raise exception 'RATE_LIMITED'; end if;

  insert into actions (room_id, player_uid, client_id, kind, payload)
  values (r_id, auth.uid(), p_client_id, k, p_payload)
  on conflict (room_id, client_id) do nothing
  returning seq into new_seq;
  update players set last_seen_at = now() where room_id = r_id and uid = auth.uid();
  return coalesce(new_seq, 0);
end $$;

-- Host: close room and clear its data.
create or replace function public.close_room(p_code text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from rooms where code = upper(p_code) and host_uid = auth.uid();
end $$;

-- Housekeeping: delete rooms idle for more than a day. Call manually or via pg_cron.
create or replace function public.cleanup_old_rooms()
returns int
language sql security definer set search_path = public, extensions as $$
  with d as (delete from rooms where updated_at < now() - interval '24 hours' returning 1)
  select count(*)::int from d;
$$;

revoke all on function public.cleanup_old_rooms() from public, anon, authenticated;
grant execute on function public.create_room() to authenticated;
grant execute on function public.resume_room(text) to authenticated;
grant execute on function public.get_room_state(text) to authenticated;
grant execute on function public.join_room(text, text, text, text, text) to authenticated;
grant execute on function public.submit_action(text, text, jsonb) to authenticated;
grant execute on function public.close_room(text) to authenticated;

-- ---------- realtime ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'actions'
  ) then
    alter publication supabase_realtime add table public.actions;
  end if;
end $$;
