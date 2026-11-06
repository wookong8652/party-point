
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";
import { MISSIONS, MissionLevel } from "@/lib/missions";

export const runtime = "nodejs";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const createToken = () => randomBytes(32).toString("hex");

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 환경변수가 없습니다.");
  }

  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function authenticate(
  db: ReturnType<typeof getAdminClient>,
  body: any,
  req: NextRequest,
  host = false
) {
  const code = String(body.code || "").toUpperCase();

  const { data: room, error } = await db
    .from("rooms")
    .select("*")
    .eq("code", code)
    .single();

  if (error || !room) {
    throw new Error("방을 찾을 수 없습니다.");
  }

  const supplied =
    req.headers.get(host ? "x-host-token" : "x-player-token") ||
    body.token ||
    "";

  if (!supplied) {
    throw new Error("인증 정보가 없습니다.");
  }

  if (host) {
    if (hash(supplied) !== room.host_token_hash) {
      throw new Error("진행자 인증에 실패했습니다.");
    }

    return { room, player: null };
  }

  const { data: player, error: playerError } = await db
    .from("players")
    .select("*")
    .eq("room_id", room.id)
    .eq("token_hash", hash(supplied))
    .single();

  if (playerError || !player) {
    throw new Error("참가자 인증에 실패했습니다.");
  }

  return { room, player };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getAdminClient();

    if (body.action === "create_room") {
      const hostToken = createToken();
      const playerToken = createToken();

      let roomCode = randomBytes(4)
        .toString("hex")
        .slice(0, 6)
        .toUpperCase();

      for (let i = 0; i < 6; i++) {
        const { data } = await db
          .from("rooms")
          .select("id")
          .eq("code", roomCode)
          .maybeSingle();

        if (!data) break;

        roomCode = randomBytes(4)
          .toString("hex")
          .slice(0, 6)
          .toUpperCase();
      }

      const { data: room, error: roomError } = await db
        .from("rooms")
        .insert({
          code: roomCode,
          name: String(body.roomName || "생일파티").slice(0, 30),
          status: "waiting",
          host_token_hash: hash(hostToken),
        })
        .select()
        .single();

      if (roomError) throw roomError;

      const { data: player, error: playerError } = await db
        .from("players")
        .insert({
          room_id: room.id,
          nickname: String(body.nickname).slice(0, 12),
          points: 5000,
          token_hash: hash(playerToken),
          is_host: true,
        })
        .select("id")
        .single();

      if (playerError) throw playerError;

      const { error: transactionError } = await db
        .from("point_transactions")
        .insert({
          room_id: room.id,
          player_id: player.id,
          amount: 5000,
          reason: "시작 포인트 지급",
        });

      if (transactionError) throw transactionError;

      return NextResponse.json({
        code: roomCode,
        hostToken,
        playerToken,
      });
    }

    if (body.action === "join_room") {
      const roomCode = String(body.code || "").toUpperCase();

      const { data: room, error: roomError } = await db
        .from("rooms")
        .select("*")
        .eq("code", roomCode)
        .single();

      if (roomError || !room) {
        throw new Error("초대 코드를 확인해줘.");
      }

      if (room.status !== "waiting") {
        throw new Error("이미 시작된 파티에는 참가할 수 없어.");
      }

      const { count } = await db
        .from("players")
        .select("*", { count: "exact", head: true })
        .eq("room_id", room.id);

      if ((count || 0) >= 10) {
        throw new Error("최대 참가 인원 10명이 모두 찼어.");
      }

      const nickname = String(body.nickname || "").trim().replace(/\\s+/g, " ");
      if (!nickname || nickname.length > 12) {
        throw new Error("닉네임은 1~12자로 입력해줘.");
      }
      const { data: duplicate } = await db
        .from("players")
        .select("id")
        .eq("room_id", room.id)
        .eq("nickname", nickname)
        .maybeSingle();
      if (duplicate) {
        throw new Error("이미 사용 중인 닉네임이야. 다른 닉네임을 입력해줘.");
      }

      const playerToken = createToken();

      const { data: player, error: playerError } = await db
        .from("players")
        .insert({
          room_id: room.id,
          nickname,
          points: 5000,
          token_hash: hash(playerToken),
        })
        .select("id")
        .single();

      if (playerError) throw playerError;

      const { error: transactionError } = await db
        .from("point_transactions")
        .insert({
          room_id: room.id,
          player_id: player.id,
          amount: 5000,
          reason: "시작 포인트 지급",
        });

      if (transactionError) throw transactionError;

      return NextResponse.json({ playerToken });
    }

    if (body.action === "assign_mission") {
      const { room, player } = await authenticate(db, body, req);
      const level = body.level as MissionLevel;
      if (!["easy", "normal", "hard"].includes(level)) {
        throw new Error("난이도를 선택해줘.");
      }

      // 방 단위 DB 잠금 안에서 선택과 저장을 함께 처리해 동시 배정 중복을 막는다.
      const { data: selected, error: assignError } = await db.rpc(
        "assign_unique_party_mission",
        {
          p_room_id: room.id,
          p_player_id: player.id,
          p_level: level,
          p_missions: MISSIONS,
        }
      );

      if (assignError) {
        console.error("assign_unique_party_mission failed:", assignError);
        throw new Error(
          assignError.message?.includes("모두 배정")
            ? "이 난이도의 미션이 모두 배정됐어. 다른 난이도를 선택해줘."
            : assignError.message?.includes("이미 미션")
              ? "이미 미션을 배정받았어."
              : "미션 배정 중 오류가 발생했어. 잠시 후 다시 시도해줘."
        );
      }

      return NextResponse.json({ mission: selected });
    }

    if (body.action === "submit_mission") {
      const { player } = await authenticate(db, body, req);

      if (player.mission_status !== "active") {
        throw new Error("제출할 수 있는 미션이 없어.");
      }

      const { error } = await db
        .from("players")
        .update({ mission_status: "submitted" })
        .eq("id", player.id);

      if (error) throw error;

      return NextResponse.json({ ok: true });
    }

    if (
      body.action === "host_start" ||
      body.action === "host_finish" ||
      body.action === "host_approve_mission" ||
      body.action === "host_reject_mission" ||
      body.action === "host_adjust_points"
    ) {
      const { room } = await authenticate(db, body, req, true);

      if (body.action === "host_start") {
        const { data: partyPlayers, error: partyPlayersError } = await db
          .from("players")
          .select("id,nickname,mission_status")
          .eq("room_id", room.id)
          .eq("is_host", false);
        if (partyPlayersError) throw partyPlayersError;
        if ((partyPlayers || []).length < 2) {
          throw new Error("최소 2명 이상 참가해야 시작할 수 있어.");
        }
        const missionPending = (partyPlayers || []).filter((p:any) => !["submitted","approved"].includes(p.mission_status));
        if (missionPending.length) {
          const names = missionPending.map((p:any)=>p.nickname).join(", ");
          throw new Error(`모든 참가자가 비밀 미션 성공 확인 요청을 눌러야 게임을 시작할 수 있어. 미요청: ${names}`);
        }

        const { error } = await db
          .from("rooms")
          .update({
            status: "playing",
            started_at: new Date().toISOString(),
          })
          .eq("id", room.id);

        if (error) throw error;

        return NextResponse.json({ ok: true });
      }

      if (body.action === "host_finish") {
        const { data: finalPlayers, error: playersError } = await db
          .from("players")
          .select("id,nickname,points")
          .eq("room_id", room.id)
          .eq("is_host", false)
          .order("points", { ascending: false })
          .order("created_at", { ascending: true });
        if (playersError) throw playersError;
        const { error: closeError } = await db.from("party_game_sessions")
          .update({ status: "settled", settled_at: new Date().toISOString() })
          .eq("room_id", room.id).in("status", ["active", "closed"]);
        if (closeError) throw closeError;
        const { error } = await db.from("rooms").update({ status: "finished" }).eq("id", room.id);
        if (error) throw error;
        return NextResponse.json({ ok: true, standings: finalPlayers || [], winner: finalPlayers?.[0] || null });
      }

      const { data: player, error: findError } = await db
        .from("players")
        .select("*")
        .eq("room_id", room.id)
        .eq("id", body.playerId)
        .single();

      if (findError || !player) {
        throw new Error("참가자를 찾을 수 없어.");
      }

      if (body.action === "host_reject_mission") {
        const { error } = await db
          .from("players")
          .update({ mission_status: "rejected" })
          .eq("id", player.id);

        if (error) throw error;

        return NextResponse.json({ ok: true });
      }

      if (body.action === "host_approve_mission") {
        if (player.mission_status !== "submitted") {
          throw new Error("제출된 미션이 아니야.");
        }

        const amount = Number(player.mission_reward || 0);

        const { error } = await db
          .from("players")
          .update({
            points: player.points + amount,
            mission_status: "approved",
          })
          .eq("id", player.id);

        if (error) throw error;

        const { error: transactionError } = await db
          .from("point_transactions")
          .insert({
            room_id: room.id,
            player_id: player.id,
            amount,
            reason: `비밀 미션 성공: ${player.mission_title}`,
          });

        if (transactionError) throw transactionError;

        return NextResponse.json({ ok: true });
      }

      const amount = Number(body.amount);
      const reason = String(body.reason || "").trim().slice(0, 120);

      if (
        !Number.isInteger(amount) ||
        amount === 0 ||
        Math.abs(amount) > 1000000
      ) {
        throw new Error("포인트 변경량을 확인해줘.");
      }

      if (!reason) {
        throw new Error("포인트 변경 사유를 입력해줘.");
      }

      if (player.points + amount < 0) {
        throw new Error("보유 포인트보다 많이 차감할 수 없어.");
      }

      const { error } = await db
        .from("players")
        .update({ points: player.points + amount })
        .eq("id", player.id);

      if (error) throw error;

      const { error: transactionError } = await db
        .from("point_transactions")
        .insert({
          room_id: room.id,
          player_id: player.id,
          amount,
          reason,
        });

      if (transactionError) throw transactionError;

      return NextResponse.json({ ok: true });
    }


    if (body.action === "host_start_quiz_round") {
      const { room } = await authenticate(db, body, req, true);
      const question = String(body.question || "").trim().slice(0, 500);
      const roundNumber = Number(body.roundNumber);
      if (!question) throw new Error("퀴즈 질문을 입력해줘.");
      if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > 7) {
        throw new Error("문제 번호는 1~7 사이여야 해.");
      }
      const { data: active } = await db.from("game_rounds")
        .select("id").eq("room_id", room.id).eq("status", "answering").maybeSingle();
      if (active) throw new Error("현재 진행 중인 퀴즈 라운드가 있어.");
      const endsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await db.from("game_rounds").insert({
        room_id: room.id, game_key: "subjective_quiz", round_number: roundNumber,
        question, status: "answering", started_at: new Date().toISOString(), ends_at: endsAt
      }).select("id,game_key,round_number,question,status,started_at,ends_at").single();
      if (error) throw error;
      return NextResponse.json({ round: data });
    }

    if (body.action === "player_submit_quiz_answer") {
      const { room, player } = await authenticate(db, body, req);
      const answer = String(body.answer || "").trim().slice(0, 300);
      if (!answer) throw new Error("답변을 입력해줘.");
      const { data: round, error: roundError } = await db.from("game_rounds")
        .select("*").eq("id", body.roundId).eq("room_id", room.id).single();
      if (roundError || !round) throw new Error("퀴즈 라운드를 찾을 수 없어.");
      if (round.status !== "answering") {
        throw new Error("답변 시간이 끝났어.");
      }
      const { data: existing } = await db.from("quiz_answers").select("id")
        .eq("round_id", round.id).eq("player_id", player.id).maybeSingle();
      if (existing) throw new Error("이미 답변을 제출했어.");
      const { error } = await db.from("quiz_answers").insert({
        room_id: room.id, round_id: round.id, player_id: player.id, answer
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "host_get_quiz_answers") {
      const { room } = await authenticate(db, body, req, true);
      const { data: answers, error } = await db.from("quiz_answers")
        .select("id,player_id,answer,submitted_at,judged,correct,players(nickname)")
        .eq("room_id", room.id).eq("round_id", body.roundId).order("submitted_at");
      if (error) throw error;
      return NextResponse.json({ answers: answers || [] });
    }

    if (body.action === "host_grade_quiz_answer") {
      const { room } = await authenticate(db, body, req, true);
      const reward = Number(body.reward ?? 300);
      if (!Number.isInteger(reward) || reward < 0 || reward > 2000) {
        throw new Error("보상은 0~2,000P 사이로 입력해줘.");
      }
      const { data, error } = await db.rpc("award_quiz_answer_points", {
        p_room_id: room.id,
        p_answer_id: String(body.answerId || ""),
        p_correct: Boolean(body.correct),
        p_reward: reward,
      });
      if (error) throw new Error(`퀴즈 포인트 지급 실패: ${error.message}`);
      if (!data?.ok) throw new Error(data?.error || "퀴즈 채점에 실패했어.");
      return NextResponse.json({ ok: true, awarded: Number(data.awarded || 0), pointsBefore: data.points_before, pointsAfter: data.points_after });
    }

    if (body.action === "host_close_quiz_round") {
      const { room } = await authenticate(db, body, req, true);
      const { error } = await db.from("game_rounds").update({ status: "closed" })
        .eq("id", body.roundId).eq("room_id", room.id).eq("status", "answering");
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "host_get_active_round") {
      const { room } = await authenticate(db, body, req, true);
      const { data, error } = await db.from("game_rounds").select("id,game_key,round_number,question,status,started_at,ends_at")
        .eq("room_id", room.id).eq("game_key", "subjective_quiz")
        .in("status", ["answering", "closed"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return NextResponse.json({ round: data });
    }


    // 통합 게임 시스템: 진행자가 세션을 열고 참가자가 선택/베팅하며 서버가 정산
    if (body.action === "host_create_game") {
      const { room } = await authenticate(db, body, req, true);
      if (room.status === "finished") throw new Error("이미 종료된 파티야. 새 게임을 시작할 수 없어.");
      const allowed: Record<string, string> = {
        odd_even: "홀짝",
        secret_auction_1: "비밀경매 1라운드 · 정답 +1,000P권",
        secret_auction_2: "비밀경매 2라운드 · 베팅 무료권",
        devil_double: "악마의 더블업",
        ox_pool: "OX 풀배당",
        rps: "가위바위보 토너먼트",
        free_choice: "자유 선택 게임"
      };
      const gameKey = String(body.gameKey || "");
      if (!allowed[gameKey]) throw new Error("지원하지 않는 게임이야.");
      const { data: active } = await db.from("party_game_sessions").select("id")
        .eq("room_id", room.id).in("status", ["active", "closed"]).maybeSingle();
      if (active) throw new Error("이미 진행 중인 게임이 있어. 먼저 마감/정산해줘.");
      const roundNumber = Number(body.roundNumber || 1);
      const question = String(body.question || "").trim().slice(0, 500) || null;
      const secretAnswer = gameKey === "ox_pool" ? String(body.answer || "").toUpperCase() : null;
      if (gameKey === "ox_pool" && !["O", "X"].includes(secretAnswer || "")) throw new Error("OX 정답을 O 또는 X로 지정해줘.");
      const { data, error } = await db.from("party_game_sessions").insert({
        room_id: room.id, game_key: gameKey, game_title: allowed[gameKey], round_number: roundNumber,
        status: "active", question, secret_answer: secretAnswer,
        public_data: gameKey === "ox_pool" ? { bet_min: 100, bet_max: 1000 } : {},
        started_at: new Date().toISOString()
      }).select("id,game_key,game_title,round_number,status,question,public_data,started_at").single();
      if (error) throw error;
      return NextResponse.json({ session: data });
    }

    if (body.action === "player_game_entry") {
      const { room, player } = await authenticate(db, body, req);
      if (room.status === "finished") throw new Error("파티가 종료되어 더 이상 게임에 참여할 수 없어.");
      const { data: session, error: sessionError } = await db.from("party_game_sessions").select("*")
        .eq("id", body.sessionId).eq("room_id", room.id).single();
      if (sessionError || !session || session.status !== "active") throw new Error("현재 참여할 수 있는 게임이 없어.");
      let choice = String(body.choice || "").trim().slice(0, 30);
      if (session.game_key === "ox_pool") {
        choice = choice.toUpperCase();
        if (choice !== "O" && choice !== "X") throw new Error("OX 선택은 O 또는 X만 가능해. O/X 중 하나를 다시 선택해줘.");
      }
      let amount = Number(body.amount || 0);
      if (!Number.isInteger(amount) || amount < 0) throw new Error("베팅 금액을 확인해줘.");
      if (["odd_even", "ox_pool"].includes(session.game_key) && (amount < 100 || amount > 1000)) throw new Error("베팅은 100~1,000P로 해줘.");
      if (session.game_key === "devil_double") {
        if (!["enter", "skip"].includes(choice)) throw new Error("더블업 참여 여부를 선택해줘.");
        amount = choice === "enter" ? 1000 : 0;
      }
      if (["secret_auction_1", "secret_auction_2"].includes(session.game_key) && amount < 100) throw new Error("경매 입찰은 최소 100P야.");
      if (["odd_even", "ox_pool", "secret_auction_1", "secret_auction_2"].includes(session.game_key) && !choice) throw new Error("선택을 먼저 해줘.");
      const freeCouponId = String(body.freeCouponId || "");
      let freeBet = false;
      if (freeCouponId) {
        if (session.game_key !== "odd_even") throw new Error("베팅 무료권은 홀짝 게임에서만 사용할 수 있어. OX에서는 사용할 수 없어.");
        const { data: coupon, error: couponError } = await db.from("party_game_coupons").select("*").eq("id", freeCouponId).eq("player_id", player.id).eq("room_id", room.id).eq("coupon_type", "free_bet").is("used_at", null).single();
        if (couponError || !coupon) throw new Error("사용 가능한 베팅 무료권이 없어.");
        freeBet = true;
      }
      if (player.points < amount && !freeBet) throw new Error("보유 포인트가 부족해.");
      if (["secret_auction_1", "secret_auction_2"].includes(session.game_key) && amount > player.points) throw new Error("현재 보유 포인트보다 높게 입찰할 수 없어.");
      const { data: prior } = await db.from("party_game_entries").select("id").eq("session_id", session.id).eq("player_id", player.id).maybeSingle();
      if (prior) throw new Error("이미 이번 라운드에 참여했어.");
      const { error } = await db.from("party_game_entries").insert({
        session_id: session.id, room_id: room.id, player_id: player.id, choice, amount,
        payload: { ...(body.payload && typeof body.payload === "object" ? body.payload : {}), free_bet: freeBet }
      });
      if (error) throw error;
      if (freeBet) {
        const { error: usedError } = await db.from("party_game_coupons").update({ used_at: new Date().toISOString() }).eq("id", freeCouponId);
        if (usedError) throw usedError;
      }
      if (amount > 0 && ["odd_even", "ox_pool", "devil_double"].includes(session.game_key) && !freeBet) {
        const { error: debitError } = await db.from("players").update({ points: player.points - amount }).eq("id", player.id).gte("points", amount);
        if (debitError) throw debitError;
        const { error: txError } = await db.from("point_transactions").insert({ room_id: room.id, player_id: player.id, amount: -amount, reason: `${session.game_title} 베팅금 선차감` });
        if (txError) throw txError;
      }
      return NextResponse.json({ ok: true });
    }

    if (body.action === "host_get_game_entries") {
      const { room } = await authenticate(db, body, req, true);
      const { data, error } = await db.from("party_game_entries")
        .select("id,player_id,choice,amount,payload,created_at,players(nickname)")
        .eq("room_id", room.id).eq("session_id", body.sessionId).order("created_at");
      if (error) throw error;
      return NextResponse.json({ entries: data || [] });
    }

    if (body.action === "host_close_game") {
      const { room } = await authenticate(db, body, req, true);
      const { data: closingSession, error: sessionError } = await db.from("party_game_sessions").select("*")
        .eq("id", body.sessionId).eq("room_id", room.id).eq("status", "active").single();
      if (sessionError || !closingSession) throw new Error("마감할 게임을 찾을 수 없어.");
      let publicData = closingSession.public_data || {};
      if (closingSession.game_key === "rps") {
        const { data: entries, error: entriesError } = await db.from("party_game_entries")
          .select("player_id,players(nickname)").eq("session_id", closingSession.id);
        if (entriesError) throw entriesError;
        const entrants = (entries || []).map((entry:any) => ({
          id: entry.player_id,
          nickname: Array.isArray(entry.players) ? entry.players[0]?.nickname : entry.players?.nickname || "참가자"
        }));
        if (entrants.length < 2) throw new Error("가위바위보 토너먼트는 2명 이상 참가해야 해.");
        for (let i=entrants.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [entrants[i],entrants[j]]=[entrants[j],entrants[i]]; }
        const matches:any[]=[];
        for(let i=0;i<entrants.length;i+=2){
          const p1=entrants[i],p2=entrants[i+1]||null;
          matches.push({id:`r1m${matches.length+1}`,player1:p1,player2:p2,winner_id:p2?null:p1.id,bye:!p2});
        }
        publicData={...publicData,bracket:{rounds:[{round:1,matches}],champion_id:null,runner_up_id:null}};
        if(matches.length===1 && matches[0].winner_id){
          publicData.bracket.champion_id=matches[0].winner_id;
          publicData.bracket.runner_up_id=null;
        }
      }
      const { error } = await db.from("party_game_sessions").update({ status: "closed", public_data: publicData })
        .eq("id", closingSession.id).eq("room_id", room.id).eq("status", "active");
      if (error) throw error;
      return NextResponse.json({ ok: true, public_data: publicData });
    }

    if (body.action === "host_set_rps_match_winner") {
      const { room } = await authenticate(db, body, req, true);
      const { data: session, error } = await db.from("party_game_sessions").select("*")
        .eq("id", body.sessionId).eq("room_id", room.id).eq("game_key", "rps").eq("status", "closed").single();
      if (error || !session) throw new Error("진행 중인 가위바위보 대진을 찾을 수 없어.");
      const bracket = session.public_data?.bracket;
      if (!bracket?.rounds?.length) throw new Error("대진표가 아직 만들어지지 않았어.");
      const roundIndex = Number(body.roundIndex);
      const matchId = String(body.matchId || "");
      const winnerId = String(body.winnerId || "");
      const round = bracket.rounds[roundIndex];
      const match = round?.matches?.find((m:any)=>m.id===matchId);
      if (!match || ![match.player1?.id,match.player2?.id].includes(winnerId)) throw new Error("해당 대진의 참가자 중에서 승자를 선택해줘.");
      match.winner_id=winnerId;
      const currentRoundComplete=round.matches.every((m:any)=>!!m.winner_id);
      if(currentRoundComplete){
        const winners=round.matches.map((m:any)=>m.winner_id).filter(Boolean);
        if(winners.length===1){
          bracket.champion_id=winners[0];
          const finalMatch=round.matches.find((m:any)=>m.player1?.id===winners[0]||m.player2?.id===winners[0]);
          if(finalMatch?.player1&&finalMatch?.player2) bracket.runner_up_id=finalMatch.player1.id===winners[0]?finalMatch.player2.id:finalMatch.player1.id;
        }else{
          const nextMatches:any[]=[];
          for(let i=0;i<winners.length;i+=2){
            const p1id=winners[i],p2id=winners[i+1]||null;
            const findPlayer=(id:string)=>round.matches.flatMap((m:any)=>[m.player1,m.player2].filter(Boolean)).find((p:any)=>p.id===id);
            const p1=findPlayer(p1id),p2=p2id?findPlayer(p2id):null;
            nextMatches.push({id:`r${bracket.rounds.length+1}m${nextMatches.length+1}`,player1:p1,player2:p2,winner_id:p2?null:p1id,bye:!p2});
          }
          bracket.rounds.push({round:bracket.rounds.length+1,matches:nextMatches});
          if(nextMatches.length===1&&nextMatches[0].winner_id){bracket.champion_id=nextMatches[0].winner_id;}
        }
      }
      const {error:updateError}=await db.from("party_game_sessions").update({public_data:{...session.public_data,bracket}}).eq("id",session.id);
      if(updateError)throw updateError;
      return NextResponse.json({ok:true,bracket});
    }

    if (body.action === "host_settle_game") {
      const { room } = await authenticate(db, body, req, true);
      const { data: session, error: se } = await db.from("party_game_sessions").select("*")
        .eq("id", body.sessionId).eq("room_id", room.id).single();
      if (se || !session) throw new Error("게임을 찾을 수 없어.");
      if (session.status === "settled") throw new Error("이미 정산된 게임이야.");
      const { data: entries, error: ee } = await db.from("party_game_entries").select("*").eq("session_id", session.id);
      if (ee) throw ee;
      const rows: any[] = entries || [];
      const playersById = new Map<string, any>();
      const loadPlayer = async (id: string) => {
        if (playersById.has(id)) return playersById.get(id);
        const { data, error } = await db.from("players").select("*").eq("id", id).eq("room_id", room.id).single();
        if (error || !data) throw new Error("참가자 정보를 찾을 수 없어.");
        playersById.set(id, data); return data;
      };
      const changePoints = async (playerId: string, delta: number, reason: string) => {
        if (!delta) return;
        const player = await loadPlayer(playerId);
        if (player.points + delta < 0) throw new Error(`${player.nickname}의 포인트가 부족해.`);
        const { error } = await db.from("players").update({ points: player.points + delta }).eq("id", playerId);
        if (error) throw error;
        player.points += delta;
        const { error: txError } = await db.from("point_transactions").insert({ room_id: room.id, player_id: playerId, amount: delta, reason });
        if (txError) throw txError;
      };
      const key = session.game_key;
      let resolvedOddEvenOutcome: "odd" | "even" | null = null;
      if (key === "odd_even") {
        // 결과는 방장이 고르지 않고 서버에서 50:50으로 무작위 추첨한다.
        resolvedOddEvenOutcome = Math.random() < 0.5 ? "odd" : "even";
        for (const e of rows) if (e.amount > 0 && e.choice === resolvedOddEvenOutcome) await changePoints(e.player_id, e.amount * 2, "홀짝 승리 · 총 2배 반환");
      } else if (key === "devil_double") {
        const playerResults: Record<string, { participated:boolean; success:boolean; nickname:string }> = {};
        for (const e of rows) {
          const player = await loadPlayer(e.player_id);
          if (e.choice !== "enter") {
            playerResults[e.player_id] = { participated:false, success:false, nickname:player.nickname };
            continue;
          }
          const success = Math.random() < 0.4;
          playerResults[e.player_id] = { participated:true, success, nickname: player.nickname };
          if (success) await changePoints(e.player_id, 2500, "악마의 더블업 성공 · 총 지급 2,500P");
        }
        session.public_data = { ...(session.public_data || {}), player_results: playerResults };
      } else if (key === "ox_pool") {
        const answer = String(session.secret_answer || "").trim().toUpperCase();
        if (answer !== "O" && answer !== "X") throw new Error("저장된 OX 정답이 올바르지 않아. 게임을 다시 출제해줘.");
        // O/X는 반드시 대문자 한 글자로 비교한다. 홀짝 값(odd/even 등)이
        // 잘못 저장된 오래된 참가 기록은 정답 풀에 섞이지 않도록 제외한다.
        const validRows = rows.filter(e => ["O", "X"].includes(String(e.choice || "").trim().toUpperCase()));
        const winners = validRows.filter(e => String(e.choice).trim().toUpperCase() === answer);
        const losers = validRows.filter(e => String(e.choice).trim().toUpperCase() !== answer);
        const totalWinnerStake = winners.reduce((sum, e) => sum + e.amount, 0);
        const loserPool = losers.filter(e => !e.payload?.free_bet).reduce((sum, e) => sum + e.amount, 0);
        if (winners.length === 0) {
          // 전원 오답: 이미 선차감된 실제 베팅금은 그대로 소멸. 무료권 베팅은 손실 없음.
        } else if (losers.length === 0) {
          // 전원 정답: 실제 베팅금은 이미 차감되었으므로 각자 원금 전액을 돌려준다.
          for (const e of winners) {
            if (!e.payload?.free_bet && e.amount > 0) await changePoints(e.player_id, e.amount, "OX 전원 정답 · 베팅 원금 반환");
          }
        } else {
          for (const e of winners) {
            const share = totalWinnerStake > 0 ? Math.floor(loserPool * e.amount / totalWinnerStake) : 0;
            await changePoints(e.player_id, (e.payload?.free_bet ? 0 : e.amount) + share, "OX 정답 · 원금 및 풀배당 지급");
          }
        }
      } else if (key === "secret_auction_1" || key === "secret_auction_2") {
        if (!rows.length) throw new Error("입찰자가 없어.");
        const sorted = [...rows].sort((a,b) => b.amount - a.amount || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const winner = sorted[0];
        await changePoints(winner.player_id, -Number(winner.amount), `${session.game_title} 낙찰 금액 결제`);
        const couponType = key === "secret_auction_1" ? "answer_1000" : "free_bet";
        const { error } = await db.from("party_game_coupons").insert({ room_id: room.id, player_id: winner.player_id, coupon_type: couponType, source_session_id: session.id });
        if (error) throw error;
        session.public_data = { ...(session.public_data || {}), winner_player_id: winner.player_id, winner_nickname: (await loadPlayer(winner.player_id)).nickname, winning_bid: winner.amount };
      } else if (key === "rps") {
        const bracket = session.public_data?.bracket;
        const winnerId = String(bracket?.champion_id || "");
        const runnerId = String(bracket?.runner_up_id || "");
        if (!winnerId || !runnerId || winnerId === runnerId) throw new Error("모든 토너먼트 대진의 승자를 입력해 결승까지 완료해줘.");
        if (!rows.some(e => e.player_id === winnerId) || !rows.some(e => e.player_id === runnerId)) throw new Error("토너먼트 참가자 중에서 우승자와 준우승자를 확인해줘.");
        await changePoints(winnerId, 1000, "가위바위보 우승 보상");
        await changePoints(runnerId, 500, "가위바위보 준우승 보상");
      } else if (key === "free_choice") {
        const winnerId = String(body.winnerId || "");
        const reward = Number(body.reward || 0);
        if (!winnerId || !rows.some(e => e.player_id === winnerId) || !Number.isInteger(reward) || reward < 0 || reward > 5000) throw new Error("우승자 또는 보상 포인트를 확인해줘.");
        await changePoints(winnerId, reward, "자유 선택 게임 보상");
      }
      let resultData: any = { ...(session.public_data || {}) };
      if (key === "odd_even") resultData.outcome = resolvedOddEvenOutcome;
      if (key === "devil_double") resultData.player_results = session.public_data?.player_results || {};
      if (key === "ox_pool") resultData.answer = String(session.secret_answer || "").toUpperCase();
      if (key === "rps") {
        resultData.bracket = session.public_data?.bracket || {};
        resultData.winner_nickname = (await loadPlayer(resultData.bracket.champion_id)).nickname;
        resultData.runner_up_nickname = (await loadPlayer(resultData.bracket.runner_up_id)).nickname;
      }
      if (key === "free_choice") {
        const winner = rows.find(e => e.player_id === String(body.winnerId || ""));
        if (winner) resultData.winner_nickname = (await loadPlayer(winner.player_id)).nickname;
      }
      const { error: finalError } = await db.from("party_game_sessions").update({ status: "settled", public_data: resultData, settled_at: new Date().toISOString() }).eq("id", session.id);
      if (finalError) throw finalError;
      return NextResponse.json({ ok: true, entries: rows.length });
    }

    if (body.action === "player_get_game_coupons") {
      const { room, player } = await authenticate(db, body, req);
      const { data, error } = await db.from("party_game_coupons").select("id,coupon_type,created_at,used_at")
        .eq("room_id", room.id).eq("player_id", player.id).is("used_at", null);
      if (error) throw error;
      return NextResponse.json({ coupons: data || [] });
    }

    if (body.action === "host_get_current_game") {
      const { room } = await authenticate(db, body, req, true);
      const { data, error } = await db.from("party_game_sessions").select("id,game_key,game_title,round_number,status,question,public_data,started_at,ends_at,created_at,settled_at")
        .eq("room_id", room.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return NextResponse.json({ session: data });
    }

    if (body.action === "player_get_ox_pool") {
      const code=String(body.code||"").toUpperCase();
      const {data:room,error:roomError}=await db.from("rooms").select("id").eq("code",code).single();
      if(roomError||!room)throw new Error("방을 찾을 수 없어.");
      const {data:session,error:sessionError}=await db.from("party_game_sessions").select("id,status,game_key")
        .eq("id",body.sessionId).eq("room_id",room.id).eq("game_key","ox_pool").single();
      if(sessionError||!session)throw new Error("OX 게임을 찾을 수 없어.");
      const {data:entries,error:entriesError}=await db.from("party_game_entries")
        .select("choice,amount,player_id,players(nickname)").eq("session_id",session.id).order("created_at",{ascending:true});
      if(entriesError)throw entriesError;
      const rows=(entries||[]).map((e:any)=>({
        playerId:e.player_id,
        nickname:Array.isArray(e.players)?e.players[0]?.nickname:e.players?.nickname||"참가자",
        choice:String(e.choice||"").trim().toUpperCase(),
        amount:Number(e.amount||0),
      }));
      const oPool=rows.filter((e:any)=>e.choice==="O").reduce((n:number,e:any)=>n+e.amount,0);
      const xPool=rows.filter((e:any)=>e.choice==="X").reduce((n:number,e:any)=>n+e.amount,0);
      const total=oPool+xPool;
      const bets=rows.map((e:any)=>{
        const sidePool=e.choice==="O"?oPool:e.choice==="X"?xPool:0;
        return {...e,sideSharePercent:sidePool?Number((e.amount/sidePool*100).toFixed(1)):0,poolSharePercent:total?Number((e.amount/total*100).toFixed(1)):0};
      });
      return NextResponse.json({pool:{oPool,xPool,total,oShare:total?Number((oPool/total*100).toFixed(1)):0,xShare:total?Number((xPool/total*100).toFixed(1)):0,oProfitPercent:oPool?Number((xPool/oPool*100).toFixed(1)):null,xProfitPercent:xPool?Number((oPool/xPool*100).toFixed(1)):null,oMultiplier:oPool?Number((total/oPool).toFixed(2)):null,xMultiplier:xPool?Number((total/xPool).toFixed(2)):null,bets}});
    }

    if (body.action === "player_get_point_history") {
      const { room, player } = await authenticate(db, body, req);
      const { data:transactions, error } = await db.from("point_transactions")
        .select("id,amount,reason,created_at")
        .eq("room_id",room.id).eq("player_id",player.id)
        .order("created_at",{ascending:false}).limit(30);
      if(error)throw error;
      let running=Number(player.points||0);
      const history=(transactions||[]).map((tx:any)=>{
        const after=running;
        const before=after-Number(tx.amount||0);
        running=before;
        return {...tx,pointsBefore:before,pointsAfter:after};
      });
      return NextResponse.json({history,currentPoints:Number(player.points||0)});
    }

    if (body.action === "player_get_current_game") {
      // 현재 게임 무대 정보는 참가자 화면에 공개되는 데이터이므로
      // 세션 토큰 누락/갱신 문제로 참가자 화면 갱신이 막히지 않게 방 코드로 조회한다.
      const code = String(body.code || "").toUpperCase();
      const { data: room, error: roomError } = await db.from("rooms").select("id,status").eq("code", code).single();
      if (roomError || !room) throw new Error("방을 찾을 수 없어.");
      const { data, error } = await db.from("party_game_sessions").select("id,game_key,game_title,round_number,status,question,public_data,started_at,ends_at,created_at,settled_at")
        .eq("room_id", room.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return NextResponse.json({ session: data, roomStatus: room.status });
    }

    if (body.action === "player_get_current_quiz_round") {
      const code = String(body.code || "").toUpperCase();
      const { data: room, error: roomError } = await db.from("rooms").select("id").eq("code", code).single();
      if (roomError || !room) throw new Error("방을 찾을 수 없어.");
      const { data, error } = await db.from("game_rounds").select("id,round_number,question,status,started_at,ends_at,created_at")
        .eq("room_id", room.id).eq("game_key", "subjective_quiz")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return NextResponse.json({ round: data });
    }

    throw new Error("지원하지 않는 요청이야.");
  } catch (error: any) {
    console.error("PARTY POINT API ERROR:", error);

    const message =
      error?.message ||
      error?.details ||
      error?.hint ||
      "알 수 없는 서버 오류";

    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}
