-- Election war room storage. Run once in the Supabase SQL editor (or `supabase db push`).
-- Only the server touches these tables, with the service-role key. RLS is on with no
-- policies, so the anon and authenticated roles cannot read or write anything.

create table if not exists public.kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id text primary key,
  at timestamptz not null,
  item jsonb not null
);
create index if not exists alerts_at_idx on public.alerts (at desc);

create table if not exists public.news (
  id text primary key,
  title_key text not null,
  first_seen timestamptz not null,
  item jsonb not null
);
create index if not exists news_first_seen_idx on public.news (first_seen desc);

-- One running ingest pass per lane at a time.
create table if not exists public.leases (
  lane text primary key,
  holder text not null,
  expires_at timestamptz not null
);

alter table public.kv enable row level security;
alter table public.alerts enable row level security;
alter table public.news enable row level security;
alter table public.leases enable row level security;

revoke all on public.kv, public.alerts, public.news, public.leases from anon, authenticated;

create or replace function public.claim_lease(p_lane text, p_holder text, p_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.leases (lane, holder, expires_at)
  values (p_lane, p_holder, now() + make_interval(secs => p_seconds))
  on conflict (lane) do update
    set holder = excluded.holder, expires_at = excluded.expires_at
    where public.leases.expires_at < now();
  return found;
end;
$$;

create or replace function public.release_lease(p_lane text, p_holder text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.leases where lane = p_lane and holder = p_holder;
$$;

revoke execute on function public.claim_lease(text, text, int) from public, anon, authenticated;
revoke execute on function public.release_lease(text, text) from public, anon, authenticated;
grant execute on function public.claim_lease(text, text, int) to service_role;
grant execute on function public.release_lease(text, text) to service_role;

-- Keep the append-only tables small after the night is over.
create or replace function public.prune_warroom()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.alerts where at < now() - interval '7 days';
  delete from public.news where first_seen < now() - interval '7 days';
$$;
revoke execute on function public.prune_warroom() from public, anon, authenticated;
