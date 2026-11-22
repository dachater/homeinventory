-- Keep-alive heartbeat. Free Supabase projects pause after a week without
-- "sufficient activity", and one empty read a day wasn't enough. The daily
-- keep-alive now writes here, so the database sees a real change each time.

create table public.heartbeat (
  id smallint primary key default 1 check (id = 1),
  beats bigint not null default 0,
  last_beat timestamptz not null default now()
);
-- No policies: the table can't be read or changed through the API directly.
alter table public.heartbeat enable row level security;
insert into public.heartbeat default values on conflict do nothing;

-- Records one beat and returns its time. Callable without signing in (the
-- keep-alive jobs have no account); all it can do is bump this counter.
create or replace function public.heartbeat() returns timestamptz
language sql security definer set search_path = '' as $$
  insert into public.heartbeat (id, beats, last_beat) values (1, 1, now())
  on conflict (id) do update
    set beats = public.heartbeat.beats + 1, last_beat = now()
  returning last_beat;
$$;

revoke execute on function public.heartbeat() from public;
grant execute on function public.heartbeat() to anon, authenticated;
