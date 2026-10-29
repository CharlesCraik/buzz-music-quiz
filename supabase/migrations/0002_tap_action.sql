-- Adds the 'tap' action used by the Musical Chairs and Beat Mash mini-games.
-- Paste into Supabase Dashboard > SQL Editor > Run (safe to re-run).

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
