-- PARTY POINT schema: Supabase SQL Editor에서 전체 실행
create extension if not exists pgcrypto;

create table if not exists public.rooms (
 id uuid primary key default gen_random_uuid(),
 code text not null unique,
 name text not null default '생일파티',
 status text not null default 'waiting' check(status in ('waiting','playing','finished')),
 host_token_hash text not null,
 started_at timestamptz,
 created_at timestamptz not null default now()
);

create table if not exists public.players (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.rooms(id) on delete cascade,
 nickname text not null,
 points integer not null default 5000 check(points>=0),
 token_hash text not null unique,
 is_host boolean not null default false,
 mission_level text check(mission_level in ('easy','normal','hard')),
 mission_id text,
 mission_title text,
 mission_description text,
 mission_reward integer,
 mission_status text not null default 'none' check(mission_status in ('none','active','submitted','approved','rejected')),
 created_at timestamptz not null default now(),
 unique(room_id,nickname)
);

create table if not exists public.point_transactions (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.rooms(id) on delete cascade,
 player_id uuid not null references public.players(id) on delete cascade,
 amount integer not null,
 reason text not null,
 created_at timestamptz not null default now()
);

create index if not exists players_room_id_idx on public.players(room_id);
create index if not exists point_transactions_room_id_idx on public.point_transactions(room_id);

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.point_transactions enable row level security;

drop policy if exists "public can read rooms" on public.rooms;
create policy "public can read rooms" on public.rooms for select to anon,authenticated using(true);
drop policy if exists "public can read players" on public.players;
create policy "public can read players" on public.players for select to anon,authenticated using(true);
drop policy if exists "public can read transactions" on public.point_transactions;
create policy "public can read transactions" on public.point_transactions for select to anon,authenticated using(true);

grant select on public.rooms,public.players,public.point_transactions to anon,authenticated;

alter table public.rooms replica identity full;
alter table public.players replica identity full;
do $$ begin alter publication supabase_realtime add table public.rooms; exception when duplicate_object then null; when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.players; exception when duplicate_object then null; when others then null; end $$;
