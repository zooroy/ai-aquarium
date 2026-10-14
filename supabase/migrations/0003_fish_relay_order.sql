-- 上傳順序改用遞增編號排序：同一個時間戳記內的多筆上傳，原本會依隨機的 uuid 排序。
alter table public.relay_fish add column seq bigint generated always as identity;

create or replace function public.relay_list(p_room text) returns table (fish_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.relay_check_room(p_room);
  delete from public.relay_fish where room = p_room and created_at <= now() - interval '1 day';
  return query
    select f.id from public.relay_fish f where f.room = p_room order by f.seq;
end $$;
