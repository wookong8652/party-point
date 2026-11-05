-- PARTY POINT 2차 게임 시스템: Supabase SQL Editor에서 실행
create table if not exists public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  game_key text not null,
  round_number integer not null,
  question text not null,
  status text not null default 'answering' check(status in ('answering','closed','settled')),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_id uuid not null references public.game_rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  answer text not null,
  submitted_at timestamptz not null default now(),
  judged boolean not null default false,
  correct boolean,
  unique(round_id, player_id)
);

create index if not exists game_rounds_room_idx on public.game_rounds(room_id, created_at desc);
create index if not exists quiz_answers_round_idx on public.quiz_answers(round_id);

alter table public.game_rounds enable row level security;
alter table public.quiz_answers enable row level security;

drop policy if exists "public can read game rounds" on public.game_rounds;
create policy "public can read game rounds" on public.game_rounds
for select to anon, authenticated using (true);

revoke all on public.game_rounds from anon, authenticated;
grant select (id, room_id, game_key, round_number, question, status, started_at, ends_at, created_at)
on public.game_rounds to anon, authenticated;

revoke all on public.quiz_answers from anon, authenticated;
grant usage on schema public to service_role;
grant all privileges on public.game_rounds, public.quiz_answers to service_role;

alter table public.game_rounds replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.game_rounds;
exception when duplicate_object then null; when others then null; end $$;

-- 퀴즈 답변은 정답 공개 전 다른 참가자가 볼 수 없도록 브라우저 조회 권한을 주지 않습니다.
