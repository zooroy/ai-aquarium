-- 手機畫魚的轉交（design.md D2）。前端只能呼叫下面 4 個函式，不能直接讀寫資料表。
-- 常數要和 src/config/params.ts 的 RELAY_PARAMS 一致：每房 20 隻、512 KB、1 天。

create table public.relay_fish (
  id uuid primary key default gen_random_uuid(),
  room text not null check (room ~ '^[A-Za-z0-9_-]{22}$'),
  png bytea not null,
  -- clock_timestamp so uploads inside one transaction still sort by arrival.
  created_at timestamptz not null default clock_timestamp()
);
create index relay_fish_room_created_idx on public.relay_fish (room, created_at);

-- RLS on with no policies, and no table privileges: anon cannot list rooms or read rows directly.
alter table public.relay_fish enable row level security;
revoke all on table public.relay_fish from public, anon, authenticated;

create function public.relay_check_room(p_room text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_room is null or p_room !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'invalid-room';
  end if;
end $$;

-- Big-endian unsigned 32-bit integer at a 0-based byte offset.
create function public.relay_u32(p_bytes bytea, p_offset int) returns bigint
language sql immutable set search_path = '' as $$
  select get_byte(p_bytes, p_offset)::bigint * 16777216 + get_byte(p_bytes, p_offset + 1) * 65536
       + get_byte(p_bytes, p_offset + 2) * 256 + get_byte(p_bytes, p_offset + 3)
$$;

create function public.relay_upload(p_room text, p_png text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_png bytea;
  v_id uuid;
begin
  perform public.relay_check_room(p_room);
  -- 699052 = base64 length of 512 KB; reject before decoding anything bigger.
  if p_png is null or length(p_png) > 699052 then
    raise exception 'too-large';
  end if;
  begin
    v_png := decode(p_png, 'base64');
  exception when others then
    raise exception 'invalid-image';
  end;
  if length(v_png) > 524288 then
    raise exception 'too-large';
  end if;
  if length(v_png) < 24
     or substring(v_png from 1 for 8) <> '\x89504e470d0a1a0a'::bytea
     or substring(v_png from 13 for 4) <> '\x49484452'::bytea
     or public.relay_u32(v_png, 16) <> 512
     or public.relay_u32(v_png, 20) <> 256 then
    raise exception 'invalid-image';
  end if;
  -- Serialize uploads per room so the 20-fish limit holds under concurrency.
  perform pg_advisory_xact_lock(hashtext(p_room));
  if (select count(*) from public.relay_fish
      where room = p_room and created_at > now() - interval '1 day') >= 20 then
    raise exception 'room-full';
  end if;
  insert into public.relay_fish (room, png) values (p_room, v_png) returning id into v_id;
  return v_id;
end $$;

create function public.relay_list(p_room text) returns table (fish_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.relay_check_room(p_room);
  delete from public.relay_fish where room = p_room and created_at <= now() - interval '1 day';
  return query
    select f.id from public.relay_fish f where f.room = p_room order by f.created_at, f.id;
end $$;

create function public.relay_get(p_room text, p_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_png bytea;
begin
  perform public.relay_check_room(p_room);
  select f.png into v_png from public.relay_fish f
    where f.room = p_room and f.id = p_id and f.created_at > now() - interval '1 day';
  -- encode() wraps base64 every 76 characters; strip the newlines.
  return translate(encode(v_png, 'base64'), E'\n', '');
end $$;

create function public.relay_delete(p_room text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.relay_check_room(p_room);
  delete from public.relay_fish where room = p_room and id = p_id;
end $$;

revoke all on function public.relay_check_room(text) from public, anon, authenticated;
revoke all on function public.relay_u32(bytea, int) from public, anon, authenticated;
revoke all on function public.relay_upload(text, text) from public;
revoke all on function public.relay_list(text) from public;
revoke all on function public.relay_get(text, uuid) from public;
revoke all on function public.relay_delete(text, uuid) from public;
grant execute on function public.relay_upload(text, text) to anon, authenticated;
grant execute on function public.relay_list(text) to anon, authenticated;
grant execute on function public.relay_get(text, uuid) to anon, authenticated;
grant execute on function public.relay_delete(text, uuid) to anon, authenticated;
