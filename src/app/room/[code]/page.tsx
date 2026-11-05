"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {useParams} from "next/navigation";
import {supabase} from "@/lib/supabase";
import {LEVEL_LABEL,type MissionLevel} from "@/lib/missions";
import GameStage from "@/components/GameStage";

type P={id:string;room_id:string;nickname:string;points:number;mission_level:MissionLevel|null;mission_id:string|null;mission_status:string;is_host:boolean;created_at:string;mission_title?:string;mission_description?:string;mission_reward?:number};
type Round={id:string;round_number:number;question:string;status:string;started_at:string;ends_at:string};

export default function PlayerRoom(){
 const {code:raw}=useParams<{code:string}>();const code=raw.toUpperCase();
 const [room,setRoom]=useState<any>(null),[players,setPlayers]=useState<P[]>([]);
 const [level,setLevel]=useState<MissionLevel>("normal"),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const [round,setRound]=useState<Round|null>(null),[answer,setAnswer]=useState(""),[submitted,setSubmitted]=useState(false),[seconds,setSeconds]=useState(0);
 const [gameSession,setGameSession]=useState<any>(null),[gameChoice,setGameChoice]=useState("odd"),[gameAmount,setGameAmount]=useState("500"),[gameEntered,setGameEntered]=useState(false),[coupons,setCoupons]=useState<any[]>([]),[freeCouponId,setFreeCouponId]=useState("");
 const nickname=typeof window!=="undefined"?localStorage.getItem(`party-nickname-${code}`):null;
 const me=players.find(p=>p.nickname===nickname);
 const sorted=useMemo(()=>[...players].sort((a,b)=>b.points-a.points),[players]);
 const load=useCallback(async()=>{
  const {data:r}=await supabase.from("rooms").select("id,code,name,status,created_at").eq("code",code).single();
  if(!r)return;setRoom(r);
  const {data:p}=await supabase.from("players").select("id,room_id,nickname,points,mission_level,mission_id,mission_status,is_host,created_at,mission_title,mission_description,mission_reward").eq("room_id",r.id).order("created_at");
  setPlayers((p||[]) as P[]);
 },[code]);
 const loadGame=useCallback(async()=>{try{const token=sessionStorage.getItem(`party-player-${code}`);const res=await fetch("/api/game",{method:"POST",headers:{"Content-Type":"application/json","x-player-token":token||""},body:JSON.stringify({action:"player_get_current_game",code})});const d=await res.json();if(res.ok){setGameSession(d.session);if(d.session?.status!=="active")setGameEntered(false);}const cr=await fetch("/api/game",{method:"POST",headers:{"Content-Type":"application/json","x-player-token":token||""},body:JSON.stringify({action:"player_get_game_coupons",code})});const cd=await cr.json();if(cr.ok)setCoupons(cd.coupons||[]);}catch{}},[code]);
 const loadRound=useCallback(async()=>{
  const {data:r}=await supabase.from("rooms").select("id").eq("code",code).single();if(!r)return;
  const {data}=await supabase.from("game_rounds").select("id,round_number,question,status,started_at,ends_at").eq("room_id",r.id).eq("game_key","subjective_quiz").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(data){setRound(data as Round);if(data.status!=="answering")setSubmitted(true);}
 },[code]);
 useEffect(()=>{
  load();loadRound();loadGame();const poll=setInterval(()=>loadGame(),2500);
  const c=supabase.channel(`party-${code}`).on("postgres_changes",{event:"*",schema:"public",table:"players"},load).on("postgres_changes",{event:"*",schema:"public",table:"rooms"},load).on("postgres_changes",{event:"*",schema:"public",table:"game_rounds"},()=>{setSubmitted(false);setAnswer("");loadRound();}).subscribe();
  return()=>{clearInterval(poll);supabase.removeChannel(c)};
 },[code,load,loadRound,loadGame]);
 useEffect(()=>{
  if(!round||round.status!=="answering")return;
  const update=()=>setSeconds(Math.max(0,Math.ceil((new Date(round.ends_at).getTime()-Date.now())/1000)));
  update();const timer=setInterval(update,250);return()=>clearInterval(timer);
 },[round]);
 async function action(actionName:string,extra:any={}){
  setBusy(true);setError("");
  try{const token=sessionStorage.getItem(`party-player-${code}`);const res=await fetch("/api/game",{method:"POST",headers:{"Content-Type":"application/json","x-player-token":token||""},body:JSON.stringify({action:actionName,code,...extra})});const d=await res.json();if(!res.ok)throw new Error(d.error);await load();await loadRound();return d;}
  catch(e){setError(e instanceof Error?e.message:"오류가 발생했어.");}
  finally{setBusy(false);}
 }
 const levelName=me?.mission_level?LEVEL_LABEL[me.mission_level]:"";
 async function submitAnswer(){const d=await action("player_submit_quiz_answer",{roundId:round?.id,answer});if(d?.ok)setSubmitted(true);}
 async function enterGame(){const d=await action("player_game_entry",{sessionId:gameSession?.id,choice:gameSession?.game_key==="devil_double"?"enter":gameChoice,amount:Number(gameAmount),freeCouponId});if(d?.ok){setGameEntered(true);await loadGame();}}
 return <main className="page">
  <div className="row"><div className="brand">🎉 PARTY POINT</div><span className="pill">{room?.status==="playing"?"게임 진행 중":room?.status==="finished"?"종료":"대기 중"}</span></div>
  <div className="hero"><div className="eyebrow">PLAYER ROOM · {code}</div><h1>{room?.name||"파티 입장 중"}</h1><p>내 포인트와 비밀 미션을 확인하고 실시간 게임에 참여해봐.</p></div>
  {error&&<div className="error">{error}</div>}
  {round&&<section className="card stack" style={{marginBottom:14}}>
   <div className="row"><h2>주관식 퀴즈 {round.round_number}/7</h2><span className="pill">{round.status==="answering"&&seconds>0?`${seconds}초 남음`:"답변 마감"}</span></div>
   <h2>{round.question}</h2>
   {submitted?<div className="success">답변을 제출했어! 진행자의 채점을 기다려줘.</div>:round.status==="answering"&&seconds>0?<><div className="field"><label>내 답변</label><input value={answer} onChange={e=>setAnswer(e.target.value)} maxLength={300} placeholder="정답을 입력해줘."/></div><button className="btn full" disabled={busy||!answer.trim()} onClick={submitAnswer}>답변 제출</button></>:<div className="notice">답변 시간이 종료됐어. 다음 문제를 기다려줘.</div>}
  </section>}

  {gameSession&&<GameStage session={gameSession} />}
  {gameSession&&<section className="card stack" style={{marginBottom:14}}><div className="row"><h2>현재 진행 게임</h2><span className="pill">{gameSession.status==="active"?"참가 가능":gameSession.status==="closed"?"마감":"정산 완료"}</span></div><h2>{gameSession.game_title}</h2>{gameSession.question&&<div className="notice">{gameSession.question}</div>}{gameSession.status==="active"&&!gameEntered&&<>{gameSession.game_key==="odd_even"&&<div className="field"><label>홀짝 선택</label><select value={gameChoice} onChange={e=>setGameChoice(e.target.value)}><option value="odd">홀</option><option value="even">짝</option></select></div>}{gameSession.game_key==="ox_pool"&&<div className="field"><label>정답 선택</label><select value={gameChoice} onChange={e=>setGameChoice(e.target.value)}><option value="O">O</option><option value="X">X</option></select></div>}{(gameSession.game_key==="odd_even"||gameSession.game_key==="ox_pool")&&<div className="field"><label>베팅 포인트 (100~1,000P)</label><input type="number" min="100" max="1000" step="100" value={gameAmount} onChange={e=>setGameAmount(e.target.value)}/></div>}{gameSession.game_key==="odd_even"&&coupons.some(c=>c.coupon_type==="free_bet")&&<div className="field"><label>베팅 무료권 사용</label><select value={freeCouponId} onChange={e=>setFreeCouponId(e.target.value)}><option value="">사용하지 않음</option>{coupons.filter(c=>c.coupon_type==="free_bet").map(c=><option key={c.id} value={c.id}>무료권 사용</option>)}</select></div>}{(gameSession.game_key==="secret_auction_1"||gameSession.game_key==="secret_auction_2")&&<div className="field"><label>비밀 입찰 금액</label><input type="number" min="100" value={gameAmount} onChange={e=>setGameAmount(e.target.value)}/></div>}<button className="btn full" disabled={busy} onClick={enterGame}>{gameSession.game_key==="devil_double"?"1,000P로 더블업 도전":gameSession.game_key.startsWith("secret_auction")?"비밀 입찰 제출":gameSession.game_key==="rps"?"토너먼트 참가":"선택 및 베팅 제출"}</button></>}{gameEntered&&<div className="success">참가 신청 완료! 진행자의 마감 및 결과 발표를 기다려줘.</div>}{coupons.length>0&&<div className="notice"><b>보유 쿠폰</b>{coupons.map(c=><div key={c.id}>{c.coupon_type==="answer_1000"?"정답 시 +1,000P권":"한 라운드 베팅 무료권"}</div>)}</div>}</section>}

  <div className="grid2">
   <section className="card"><div className="muted">내 닉네임</div><h2 style={{marginTop:8}}>{me?.nickname||nickname||"참가자"}</h2><div className="muted">보유 포인트</div><div className="points">{me?.points?.toLocaleString()??"—"} P</div></section>
   <section className="card stack"><div><h2>내 비밀 미션</h2><p className="muted">난이도를 선택하면 해당 난이도에서 랜덤 미션이 배정돼.</p></div>{!me?.mission_id?<><div className="grid3">{(["easy","normal","hard"] as MissionLevel[]).map(l=><button key={l} className={`level ${level===l?"selected":""}`} onClick={()=>setLevel(l)}><strong>{LEVEL_LABEL[l]}</strong><span>{l==="easy"?"300P":l==="normal"?"500P":"1,000P"}</span></button>)}</div><button className="btn full" disabled={busy||room?.status==="finished"} onClick={()=>action("assign_mission",{level})}>랜덤 미션 받기</button></>:<><div className="notice"><b>{me.mission_title||me.mission_id}</b><br/>{me.mission_description}</div><div className="row"><span className="pill">{levelName}</span><b>보상 {me.mission_reward?.toLocaleString()}P</b></div><div className="muted">상태: {({active:"수행 중",submitted:"진행자 확인 대기",approved:"성공 승인",rejected:"반려"})[me.mission_status]||"미배정"}</div>{me.mission_status==="active"&&<button className="btn full" disabled={busy} onClick={()=>action("submit_mission")}>미션 성공 확인 요청</button>}{me.mission_status==="rejected"&&<div className="error">미션이 반려됐어. 진행자에게 확인해줘.</div>}</>}</section>
  </div>
  <section className="card" style={{marginTop:14}}><div className="row"><h2>실시간 순위</h2><span className="muted">{players.length}/10명</span></div><div className="list">{sorted.map((p,i)=><div className="listitem" key={p.id}><div className="player"><div className="avatar">{i+1}</div><div><b>{p.nickname}</b>{p.is_host&&<span className="muted"> · 진행자</span>}</div></div><b>{p.points.toLocaleString()}P</b></div>)}</div></section>
  <p className="muted" style={{textAlign:"center"}}>초대 코드: <b>{code}</b></p>
 </main>;
}
