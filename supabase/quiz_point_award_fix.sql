-- PARTY POINT: 퀴즈 정답 포인트 지급 원자성 보장
-- Supabase 대시보드 > SQL Editor에서 이 파일 전체를 한 번 실행하세요.
create or replace function public.award_quiz_answer_points(
  p_room_id uuid,
  p_answer_id uuid,
  p_correct boolean,
  p_reward integer default 300
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_answer public.quiz_answers%rowtype;
  v_player public.players%rowtype;
  v_coupon_id uuid;
  v_award integer := 0;
  v_before integer;
  v_after integer;
  v_reason text := '주관식 퀴즈 정답 보상';
begin
  if p_reward < 0 or p_reward > 2000 then
    return jsonb_build_object('ok',false,'error','보상 범위가 올바르지 않아.');
  end if;

  select * into v_answer
  from public.quiz_answers
  where id = p_answer_id and room_id = p_room_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','답변을 찾을 수 없어.');
  end if;
  if v_answer.judged then
    return jsonb_build_object('ok',false,'error','이미 채점한 답변이야.');
  end if;

  select * into v_player
  from public.players
  where id = v_answer.player_id and room_id = p_room_id and is_host = false
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','참가자 정보를 찾을 수 없어.');
  end if;

  v_before := v_player.points;
  if p_correct then
    v_award := p_reward;
    select id into v_coupon_id
    from public.party_game_coupons
    where room_id = p_room_id and player_id = v_player.id
      and coupon_type = 'answer_1000' and used_at is null
    order by created_at
    limit 1
    for update;

    if v_coupon_id is not null then
      v_award := v_award + 1000;
      update public.party_game_coupons
      set used_at = now()
      where id = v_coupon_id and used_at is null;
      v_reason := '주관식 퀴즈 정답 보상 + 경매 쿠폰';
    end if;
  end if;

  update public.quiz_answers
  set judged = true, correct = p_correct
  where id = v_answer.id;

  if v_award > 0 then
    v_after := v_before + v_award;
    update public.players set points = v_after where id = v_player.id;
    insert into public.point_transactions(room_id,player_id,amount,reason)
    values(p_room_id,v_player.id,v_award,v_reason);
  else
    v_after := v_before;
  end if;

  return jsonb_build_object('ok',true,'awarded',v_award,'points_before',v_before,'points_after',v_after);
end;
$$;

revoke all on function public.award_quiz_answer_points(uuid,uuid,boolean,integer) from public, anon, authenticated;
grant execute on function public.award_quiz_answer_points(uuid,uuid,boolean,integer) to service_role;
