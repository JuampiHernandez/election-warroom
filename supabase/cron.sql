-- Schedules the ingest ticks from Supabase, which works on any Vercel plan
-- (Vercel Hobby crons only run once a day).
--
-- Before running:
--   1. Replace https://YOUR-APP.vercel.app with your deployment URL.
--   2. Store the same value you set as CRON_SECRET on Vercel in Vault:
--        select vault.create_secret('<your CRON_SECRET>', 'warroom_cron_secret');
--
-- Enable the pg_cron and pg_net extensions first (Database > Extensions), or:
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.warroom_tick(p_lane text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'warroom_cron_secret';
  perform net.http_get(
    url := 'https://YOUR-APP.vercel.app/api/tick?lane=' || p_lane,
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 290000
  );
end;
$$;
revoke execute on function public.warroom_tick(text) from public, anon, authenticated;

-- Each lane decides internally which of its jobs are due, so ticking often is cheap.
select cron.schedule('warroom-results', '20 seconds', $$ select public.warroom_tick('results') $$);
select cron.schedule('warroom-news', '30 seconds', $$ select public.warroom_tick('news') $$);
select cron.schedule('warroom-money', '* * * * *', $$ select public.warroom_tick('money') $$);
select cron.schedule('warroom-prune', '0 * * * *', $$ select public.prune_warroom() $$);

-- To stop everything after election night:
--   select cron.unschedule('warroom-results');
--   select cron.unschedule('warroom-news');
--   select cron.unschedule('warroom-money');
-- and pause or delete the two Firecrawl monitors: bun scripts/monitors.ts pause
