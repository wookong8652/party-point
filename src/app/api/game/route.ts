
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

      if (player.mission_id) {
        throw new Error("이미 미션을 배정받았어.");
      }

      const level = body.level as MissionLevel;

      if (!["easy", "normal", "hard"].includes(level)) {
        throw new Error("난이도를 선택해줘.");
      }

      const { data: usedRows, error: usedError } = await db
        .from("players")
        .select("mission_id")
        .eq("room_id", room.id)
        .not("mission_id", "is", null);

      if (usedError) throw usedError;

      const usedTitles = new Set(
        (usedRows || []).map((row: any) => row.mission_id)
      );

      const available = MISSIONS.filter(
        (mission) =>
          mission.level === level && !usedTitles.has(mission.title)
      );

      if (available.length === 0) {
        throw new Error("이 난이도의 미션이 모두 배정됐어.");
      }

      const selected =
        available[Math.floor(Math.random() * available.length)];

      const { error } = await db
        .from("players")
        .update({
          mission_level: level,
          mission_id: selected.title,
          mission_title: selected.title,
          mission_description: selected.description,
          mission_reward: selected.reward,
          mission_status: "active",
        })
        .eq("id", player.id);

      if (error) throw error;

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
        const { count } = await db
          .from("players")
          .select("*", { count: "exact", head: true })
          .eq("room_id", room.id);

        if ((count || 0) < 2) {
          throw new Error("최소 2명 이상 참가해야 시작할 수 있어.");
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
        const { error } = await db
          .from("rooms")
          .update({ status: "finished" })
          .eq("id", room.id);

        if (error) throw error;

        return NextResponse.json({ ok: true });
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
      const correct = Boolean(body.correct);
      const reward = Number(body.reward ?? 300);
      if (!Number.isInteger(reward) || reward < 0 || reward > 2000) {
        throw new Error("보상은 0~2,000P 사이로 입력해줘.");
      }
      const { data: answer, error: answerError } = await db.from("quiz_answers")
        .select("*").eq("id", body.answerId).eq("room_id", room.id).single();
      if (answerError || !answer) throw new Error("답변을 찾을 수 없어.");
      if (answer.judged) throw new Error("이미 채점한 답변이야.");
      const { data: player, error: playerError } = await db.from("players")
        .select("*").eq("id", answer.player_id).eq("room_id", room.id).single();
      if (playerError || !player) throw new Error("참가자를 찾을 수 없어.");
      let amount = correct ? reward : 0;
      if (correct) {
        const { data: coupon } = await db.from("party_game_coupons").select("id").eq("room_id", room.id).eq("player_id", player.id).eq("coupon_type", "answer_1000").is("used_at", null).order("created_at").limit(1).maybeSingle();
        if (coupon) {
          amount += 1000;
          const { error: couponError } = await db.from("party_game_coupons").update({ used_at: new Date().toISOString() }).eq("id", coupon.id);
          if (couponError) throw couponError;
        }
      }
      if (amount > 0) {
        const { error } = await db.from("players").update({ points: player.points + amount }).eq("id", player.id);
        if (error) throw error;
        const { error: txError } = await db.from("point_transactions").insert({
          room_id: room.id, player_id: player.id, amount,
          reason: amount > reward ? "주관식 퀴즈 정답 보상 + 경매 쿠폰" : "주관식 퀴즈 정답 보상"
        });
        if (txError) throw txError;
      }
      const { error } = await db.from("quiz_answers")
        .update({ judged: true, correct }).eq("id", answer.id);
      if (error) throw error;
      return NextResponse.json({ ok: true, awarded: amount });
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
      const { data: session, error: sessionError } = await db.from("party_game_sessions").select("*")
        .eq("id", body.sessionId).eq("room_id", room.id).single();
      if (sessionError || !session || session.status !== "active") throw new Error("현재 참여할 수 있는 게임이 없어.");
      const choice = String(body.choice || "").trim().slice(0, 30);
      let amount = Number(body.amount || 0);
      if (!Number.isInteger(amount) || amount < 0) throw new Error("베팅 금액을 확인해줘.");
      if (["odd_even", "ox_pool"].includes(session.game_key) && (amount < 100 || amount > 1000)) throw new Error("베팅은 100~1,000P로 해줘.");
      if (session.game_key === "devil_double") amount = 1000;
      if (["secret_auction_1", "secret_auction_2"].includes(session.game_key) && amount < 100) throw new Error("경매 입찰은 최소 100P야.");
      if (["odd_even", "ox_pool", "secret_auction_1", "secret_auction_2", "devil_double"].includes(session.game_key) && !choice) throw new Error("선택을 먼저 해줘.");
      const freeCouponId = String(body.freeCouponId || "");
      let freeBet = false;
      if (freeCouponId) {
        if (session.game_key !== "odd_even") throw new Error("베팅 무료권은 홀짝 게임에서만 사용할 수 있어. OX에서는 사용할 수 없어.");
        const { data: coupon, error: couponError } = await db.from("party_game_coupons").select("*").eq("id", freeCouponId).eq("player_id", player.id).eq("room_id", room.id).eq("coupon_type", "free_bet").is("used_at", null).single();
        if (couponError || !coupon) throw new Error("사용 가능한 베팅 무료권이 없어.");
        freeBet = true;
      }
      if (player.points < amount && !freeBet) throw new Error("보유 포인트가 부족해.");
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
      if (amount > 0 && ["odd_even", "ox_pool", "devil_double", "secret_auction_1", "secret_auction_2"].includes(session.game_key) && !freeBet) {
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
      const { error } = await db.from("party_game_sessions").update({ status: "closed" })
        .eq("id", body.sessionId).eq("room_id", room.id).eq("status", "active");
      if (error) throw error;
      return NextResponse.json({ ok: true });
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
      if (key === "odd_even") {
        const outcome = String(body.outcome || "");
        if (!["odd", "even"].includes(outcome)) throw new Error("홀 또는 짝 결과를 지정해줘.");
        for (const e of rows) if (e.amount > 0 && e.choice === outcome) await changePoints(e.player_id, e.amount * 2, "홀짝 승리 · 총 2배 반환");
      } else if (key === "devil_double") {
        const success = typeof body.success === "boolean" ? body.success : Math.random() < 0.4;
        session.public_data = { ...(session.public_data || {}), success };
        for (const e of rows) {
          if (success) await changePoints(e.player_id, 2500, "악마의 더블업 성공 · 총 지급 2,500P");
        }
      } else if (key === "ox_pool") {
        const answer = String(session.secret_answer || "").toUpperCase();
        const winners = rows.filter(e => String(e.choice).toUpperCase() === answer);
        const losers = rows.filter(e => String(e.choice).toUpperCase() !== answer);
        const totalWinnerStake = winners.reduce((sum, e) => sum + e.amount, 0);
        const loserPool = losers.filter(e => !e.payload?.free_bet).reduce((sum, e) => sum + e.amount, 0);
        if (winners.length === 0) {
          // 전원 오답: 이미 선차감된 실제 베팅금은 그대로 소멸. 무료권 베팅은 손실 없음.
        } else if (losers.length === 0) {
          // 전원 정답: 실제 베팅자에게 원금 반환, 무료권은 소모만 됨.
          for (const e of winners) if (!e.payload?.free_bet) await changePoints(e.player_id, e.amount, "OX 전원 정답 · 베팅 원금 반환");
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
        const couponType = key === "secret_auction_1" ? "answer_1000" : "free_bet";
        const { error } = await db.from("party_game_coupons").insert({ room_id: room.id, player_id: winner.player_id, coupon_type: couponType, source_session_id: session.id });
        if (error) throw error;
        session.public_data = { ...(session.public_data || {}), winner_player_id: winner.player_id, winner_nickname: (await loadPlayer(winner.player_id)).nickname, winning_bid: winner.amount };
      } else if (key === "rps") {
        const winnerId = String(body.winnerId || "");
        const runnerId = String(body.runnerUpId || "");
        if (!winnerId || winnerId === runnerId) throw new Error("우승자와 준우승자를 다르게 지정해줘.");
        if (!rows.some(e => e.player_id === winnerId) || !rows.some(e => e.player_id === runnerId)) throw new Error("토너먼트 참가자 중에서 선택해줘.");
        await changePoints(winnerId, 1000, "가위바위보 우승 보상");
        await changePoints(runnerId, 500, "가위바위보 준우승 보상");
      } else if (key === "free_choice") {
        const winnerId = String(body.winnerId || "");
        const reward = Number(body.reward || 0);
        if (!winnerId || !rows.some(e => e.player_id === winnerId) || !Number.isInteger(reward) || reward < 0 || reward > 5000) throw new Error("우승자 또는 보상 포인트를 확인해줘.");
        await changePoints(winnerId, reward, "자유 선택 게임 보상");
      }
      let resultData: any = { ...(session.public_data || {}) };
      if (key === "odd_even") resultData.outcome = String(body.outcome || "");
      if (key === "devil_double") resultData.success = session.public_data?.success ?? resultData.success;
      if (key === "ox_pool") resultData.answer = String(session.secret_answer || "").toUpperCase();
      if (key === "rps" || key === "free_choice") {
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

    if (body.action === "player_get_current_game") {
      const { room } = await authenticate(db, body, req);
      const { data, error } = await db.from("party_game_sessions").select("id,game_key,game_title,round_number,status,question,public_data,started_at,ends_at,created_at,settled_at")
        .eq("room_id", room.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return NextResponse.json({ session: data });
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
