-- 每小時清掉超過一天沒人領的魚，涵蓋再也沒人查詢的房間（design.md D2）。
-- 分開放是因為 PGlite 沒有 pg_cron，測試只載入 0001。
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'relay-fish-expire',
  '0 * * * *',
  $$delete from public.relay_fish where created_at <= now() - interval '1 day'$$
);
