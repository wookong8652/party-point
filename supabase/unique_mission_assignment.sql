-- PARTY POINT: 동시 요청에도 같은 방에서 같은 미션이 중복 배정되지 않도록 하는 원자적 배정 함수
-- Supabase Dashboard > SQL Editor에서 한 번만 실행하세요.
-- 기존 rooms / players 데이터는 삭제하지 않습니다.

create or replace function public.assign_unique_party_mission(
  p_room_id uuid,
  p_player_id uuid,
  p_level text,
  p_missions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mission jsonb;
  v_existing_mission text;
begin
  if p_level not in ('easy', 'normal', 'hard') then
    raise exception '잘못된 미션 난이도입니다.';
  end if;

  -- 동일한 방의 모든 미션 배정을 직렬화한다.
  perform 1 from public.rooms where id = p_room_id for update;
  if not found then
    raise exception '방을 찾을 수 없습니다.';
  end if;

  select mission_id into v_existing_mission
  from public.players
  where id = p_player_id and room_id = p_room_id
  for update;

  if not found then
    raise exception '참가자를 찾을 수 없습니다.';
  end if;
  if v_existing_mission is not null then
    raise exception '이미 미션을 배정받았어.';
  end if;

  select candidate into v_mission
  from jsonb_array_elements(p_missions) as items(candidate)
  where candidate->>'level' = p_level
    and not exists (
      select 1 from public.players assigned
      where assigned.room_id = p_room_id
        and assigned.mission_id = candidate->>'title'
    )
  order by random()
  limit 1;

  if v_mission is null then
    raise exception '이 난이도의 미션이 모두 배정됐어.';
  end if;

  update public.players
  set mission_level = p_level,
      mission_id = v_mission->>'title',
      mission_title = v_mission->>'title',
      mission_description = v_mission->>'description',
      mission_reward = (v_mission->>'reward')::integer,
      mission_status = 'active'
  where id = p_player_id and room_id = p_room_id;

  return v_mission;
end;
$$;

revoke all on function public.assign_unique_party_mission(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.assign_unique_party_mission(uuid, uuid, text, jsonb) to service_role;
