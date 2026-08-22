create table if not exists public.rankings (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (char_length(nickname) between 1 and 12),
  stage integer not null check (stage > 0),
  board jsonb not null default '[]'::jsonb,
  ranking_version text check (ranking_version is null or char_length(ranking_version) between 1 and 40),
  created_at timestamptz not null default now()
);

alter table public.rankings
  add column if not exists ranking_version text;

alter table public.rankings
  drop constraint if exists rankings_stage_check;

alter table public.rankings
  add constraint rankings_stage_check check (stage > 0);

alter table public.rankings
  drop constraint if exists rankings_ranking_version_check;

alter table public.rankings
  add constraint rankings_ranking_version_check check (
    ranking_version is null
    or char_length(ranking_version) between 1 and 40
  );

create index if not exists rankings_stage_created_at_idx
  on public.rankings (stage desc, created_at asc);

create index if not exists rankings_version_stage_created_at_idx
  on public.rankings (ranking_version, stage desc, created_at asc);

alter table public.rankings enable row level security;

drop policy if exists "rankings are readable by everyone" on public.rankings;
create policy "rankings are readable by everyone"
  on public.rankings for select
  using (true);

drop policy if exists "rankings can be submitted by everyone" on public.rankings;
create policy "rankings can be submitted by everyone"
  on public.rankings for insert
  with check (
    char_length(nickname) between 1 and 12
    and stage > 0
    and jsonb_typeof(board) = 'array'
    and (
      ranking_version is null
      or char_length(ranking_version) between 1 and 40
    )
  );

drop policy if exists "rankings can be inserted by server only" on public.rankings;

create table if not exists public.online_presence (
  visitor_id text primary key,
  page text not null default 'game',
  version text,
  last_seen timestamptz not null default now()
);

create index if not exists online_presence_last_seen_idx
  on public.online_presence (last_seen desc);

alter table public.online_presence enable row level security;

drop policy if exists "online presence readable" on public.online_presence;
create policy "online presence readable"
  on public.online_presence for select
  using (true);

drop policy if exists "online presence insertable" on public.online_presence;
create policy "online presence insertable"
  on public.online_presence for insert
  with check (
    char_length(visitor_id) between 16 and 80
    and char_length(page) between 1 and 40
    and (
      version is null
      or char_length(version) between 1 and 40
    )
  );

drop policy if exists "online presence updatable" on public.online_presence;
create policy "online presence updatable"
  on public.online_presence for update
  using (
    char_length(visitor_id) between 16 and 80
  )
  with check (
    char_length(visitor_id) between 16 and 80
    and char_length(page) between 1 and 40
    and (
      version is null
      or char_length(version) between 1 and 40
    )
  );

create extension if not exists pg_cron with schema extensions;

do $$
begin
  perform cron.unschedule('cleanup-online-presence');
exception
  when others then null;
end $$;

select cron.schedule(
  'cleanup-online-presence',
  '*/30 * * * *',
  $$
    delete from public.online_presence
    where last_seen < now() - interval '1 day';
  $$
);
