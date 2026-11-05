-- PARTY POINT 통합 게임 시스템 추가 SQL
-- 기존 schema.sql / game_system.sql 실행 후 이 파일을 한 번 실행하세요.

create table if not exists public.party_game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  game_key text not null,
  game_title text not null,
  round_number integer not null default 1,
  status text not null default 'waiting' check(status in ('waiting','active','closed','settled')),
  question text,
  public_data jsonb not null default '{}'::jsonb,
  secret_answer text,
  started_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create table if not exists public.party_game_entries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.party_game_sessions(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  choice text,
  amount integer not null default 0 check(amount >= 0),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(session_id, player_id)
);

create table if not exists public.party_game_coupons (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  coupon_type text not null check(coupon_type in ('answer_1000','free_bet')),
  source_session_id uuid references public.party_game_sessions(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists party_game_sessions_room_idx on public.party_game_sessions(room_id, created_at desc);
create index if not exists party_game_entries_session_idx on public.party_game_entries(session_id);
create index if not exists party_game_coupons_player_idx on public.party_game_coupons(player_id, used_at);

alter table public.party_game_sessions enable row level security;
alter table public.party_game_entries enable row level security;
alter table public.party_game_coupons enable row level security;

-- 공개 화면에는 정답/비밀 입찰 내용이 노출되지 않도록 세션의 공개 컬럼만 허용
revoke all on public.party_game_sessions from anon, authenticated;
grant select (id, room_id, game_key, game_title, round_number, status, question, public_data, started_at, ends_at, created_at, settled_at)
on public.party_game_sessions to anon, authenticated;
revoke all on public.party_game_entries from anon, authenticated;
revoke all on public.party_game_coupons from anon, authenticated;

grant usage on schema public to service_role;
grant all privileges on public.party_game_sessions, public.party_game_entries, public.party_game_coupons to service_role;
grant usage, select on all sequences in schema public to service_role;

alter table public.party_game_sessions replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.party_game_sessions;
exception when duplicate_object then null; when others then null; end $$;
