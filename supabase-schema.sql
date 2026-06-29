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
    and jsonb_array_length(board) <= 10
    and (
      ranking_version is null
      or char_length(ranking_version) between 1 and 40
    )
  );
