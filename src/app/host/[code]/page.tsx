"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {useParams, useSearchParams, useRouter} from "next/navigation";
import {supabase} from "@/lib/supabase";

type P={id:string;room_id:string;nickname:string;points:number;mission_level:string|null;mission_id:string|null;mission_status:string;is_host:boolean;created_at:string;mission_title?:string;mission_description?:string;mission_reward?:number};
type QuizAnswer={id:string;player_id:string;answer:string;submitted_at:string;judged:boolean;correct:boolean|null;players:{nickname:string}|{nickname:string}[]|null};
type Round={id:string;round_number:number;question:string;status:string;ends_at:string};

export default function HostRoom(){
 const {code:raw}=useParams<{code:string}>();const code=raw.toUpperCase();const router=useRouter();const searchParams=useSearchParams();const adminOnly=searchParams.get("admin")==="1";
 const [room,setRoom]=useState<any>(null),[players,setPlayers]=useState<P[]>([]);
 const [selected,setSelected]=useState(""),[amount,setAmount]=useState("500"),[reason,setReason]=useState("");
 const [error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const [question,setQuestion]=useState(""),[roundNumber,setRoundNumber]=useState(1),[round,setRound]=useState<Round|null>(null),[answers,setAnswers]=useState<QuizAnswer[]>([]);
 const [gameKey,setGameKey]=useState("odd_even"),[gameQuestion,setGameQuestion]=useState(""),[oxAnswer,setOxAnswer]=useState("O"),[gameSession,setGameSession]=useState<any>(null),[gameEntries,setGameEntries]=useState<any[]>([]),[gameOutcome,setGameOutcome]=useState("odd"),[doubleSuccess,setDoubleSuccess]=useState(true),[winnerId,setWinnerId]=useState(""),[runnerUpId,setRunnerUpId]=useState(""),[freeReward,setFreeReward]=useState("500");
 const hostToken=()=>typeof window!=="undefined"?sessionStorage.getItem(`party-host-${code}`)||"":"";
 const load=useCallback(async()=>{
  const {data:r}=await supabase.from("rooms").select("id,code,name,status,created_at").eq("code",code).single();
  if(!r)return;setRoom(r);
  const {data:p}=await supabase.from("players").select("id,room_id,nickname,points,mission_level,mission_id,mission_status,is_host,created_at,mission_title,mission_description,mission_reward").eq("room_id",r.id).order("created_at");
  setPlayers((p||[]) as P[]);
  const participantList=(p||[]).filter((player:any)=>!player.is_host);
  setSelected((current)=>participantList.some((player:any)=>player.id===current)?current:(participantList[0]?.id||""));
 },[code]);
 const api=useCallback(async(action:string,extra:any={})=>{
  const res=await fetch("/api/game",{method:"POST",headers:{"Content-Type":"application/json","x-host-token":hostToken()},body:JSON.stringify({action,code,...extra})});
  const d=await res.json();if(!res.ok)throw new Error(d.error||"요청 실패");return d;
 },[code]);
 const refreshGame=useCallback(async()=>{try{const d=await api("host_get_current_game");setGameSession(d.session);if(d.session){const e=await api("host_get_game_entries",{sessionId:d.session.id});setGameEntries(e.entries||[]);}}catch{}},[api]);
 const refreshAnswers=useCallback(async(roundId:string)=>{
  const d=await api("host_get_quiz_answers",{roundId});setAnswers(d.answers||[]);
 },[api]);
 const refreshRound=useCallback(async()=>{
  try{const d=await api("host_get_active_round");setRound(d.round);if(d.round)await refreshAnswers(d.round.id);}catch{}
 },[api,refreshAnswers]);
 useEffect(()=>{load();refreshRound();refreshGame();const timer=setInterval(()=>{if(round?.status==="answering")refreshAnswers(round.id);refreshGame();},2500);const c=supabase.channel(`host-${code}`).on("postgres_changes",{event:"*",schema:"public",table:"players"},load).on("postgres_changes",{event:"*",schema:"public",table:"rooms"},load).on("postgres_changes",{event:"*",schema:"public",table:"game_rounds"},refreshRound).subscribe();return()=>{clearInterval(timer);supabase.removeChannel(c)};},[code,load,refreshRound,round,refreshAnswers,refreshGame]);
 const participants=useMemo(()=>players.filter(p=>!p.is_host),[players]);
 const sorted=useMemo(()=>[...participants].sort((a,b)=>b.points-a.points),[participants]);
 const pending=participants.filter(p=>p.mission_status==="submitted");
 const missionReady=participants.length>=2&&participants.every(p=>["submitted","approved"].includes(p.mission_status));
 const missionNotRequested=participants.filter(p=>!["submitted","approved"].includes(p.mission_status));
 async function call(action:string,extra:any={}){setBusy(true);setError("");setMessage("");try{await api(action,extra);setMessage("처리 완료");await load();await refreshRound();await refreshGame();}catch(e){setError(e instanceof Error?e.message:"오류가 발생했어.");}finally{setBusy(false);}}
 async function startQuiz(){setBusy(true);setError("");try{const d=await api("host_start_quiz_round",{question,roundNumber});setRound(d.round);setQuestion("");setMessage(`${roundNumber}번 문제 시작! 10초 동안 답변을 받아.`);await refreshAnswers(d.round.id);}catch(e){setError(e instanceof Error?e.message:"오류");}finally{setBusy(false);}}
 async function grade(a:QuizAnswer,correct:boolean){setBusy(true);setError("");try{await api("host_grade_quiz_answer",{answerId:a.id,correct,reward:300});await refreshAnswers(round!.id);await load();}catch(e){setError(e instanceof Error?e.message:"채점 오류");}finally{setBusy(false);}}
 const nameOf=(a:QuizAnswer)=>Array.isArray(a.players)?a.players[0]?.nickname:a.players?.nickname;
 if(adminOnly) return <main className="page">
  <div className="brand">🎛 PARTY POINT · 관리자 점수판</div>
  <div className="hero"><div className="eyebrow">ADMIN CONSOLE · {code}</div><h1>점수 관리</h1><p>별도 창에서 포인트를 지급하거나 차감하고 실시간 순위를 확인해.</p></div>
  {error&&<div className="error">{error}</div>}{message&&<div className="success">{message}</div>}
  <section className="card stack">
   <h2>포인트 지급 / 차감</h2>
   <div className="field"><label>참가자</label><select value={selected} onChange={e=>setSelected(e.target.value)}>{participants.map(p=><option key={p.id} value={p.id}>{p.nickname} ({p.points.toLocaleString()}P)</option>)}</select></div>
   <div className="grid2"><button className="btn secondary" onClick={()=>setAmount("500")}>+500P</button><button className="btn secondary" onClick={()=>setAmount("1000")}>+1,000P</button><button className="btn danger" onClick={()=>setAmount("-500")}>-500P</button><button className="btn danger" onClick={()=>setAmount("-1000")}>-1,000P</button></div>
   <div className="field"><label>변경 포인트 (+지급 / -차감)</label><input type="number" value={amount} onChange={e=>setAmount(e.target.value)}/></div>
   <div className="field"><label>변경 사유</label><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="예: 오목 대결 승리"/></div>
   <button className="btn full" disabled={busy||!selected||!reason.trim()||!Number(amount)} onClick={()=>call("host_adjust_points",{playerId:selected,amount:Number(amount),reason})}>포인트 반영</button>
  </section>
  <section className="card stack" style={{marginTop:14}}><div className="row"><h2>실시간 참가자 순위</h2><button className="btn secondary" onClick={load}>새로고침</button></div>{sorted.map((p,i)=><div className="listitem" key={p.id}><span>{i+1}. {p.nickname}</span><b>{p.points.toLocaleString()}P</b></div>)}</section>
 </main>;
 return <main className="page">
  <div className="row"><div className="brand">🎉 PARTY POINT · HOST</div><span className="pill">{room?.status==="playing"?"진행 중":room?.status==="finished"?"종료":"대기 중"}</span></div>
  <div className="hero"><div className="eyebrow">HOST CONTROL · {code}</div><h1>{room?.name||"파티 관리"}</h1><p>참가자 전원이 비밀 미션 성공 확인 요청을 제출하면 게임을 시작할 수 있어.</p><button className="btn dark" onClick={()=>window.open(`${location.pathname}?admin=1`,"party-point-admin","width=620,height=850,resizable=yes,scrollbars=yes")}>별도 관리자 창 열기 ↗</button></div>
  <section className="card stack"><div className="row"><div><div className="muted">친구 초대 코드</div><div className="points" style={{letterSpacing:4}}>{code}</div></div><button className="btn secondary" onClick={()=>navigator.clipboard.writeText(location.origin)}>접속 주소 복사</button></div><div className="notice">친구들은 웹사이트 주소와 초대 코드를 이용해 참가할 수 있어. 현재 {participants.length}/10명 참가.</div><button className="btn full" disabled={busy||room?.status!=="waiting"||participants.length<2||!missionReady} onClick={async()=>{setBusy(true);setError("");try{await api("host_start");await load();router.push(`/host/${code}/play`);}catch(e){setError(e instanceof Error?e.message:"게임 시작 실패");}finally{setBusy(false);}}}>게임 시작 · 게임 무대로 이동</button>{!missionReady&&<div className="notice">게임 시작 전 모든 참가자가 비밀 미션 성공 확인 요청을 눌러야 해. {missionNotRequested.map(p=>p.nickname).join(", ")||"참가자를 기다리는 중"}</div>}</section>
  {room?.status==="playing"&&<button className="btn full" style={{marginTop:14}} onClick={()=>router.push(`/host/${code}/play`)}>게임 진행실로 이동 ↗</button>}
  {error&&<div className="error" style={{marginTop:14}}>{error}</div>}{message&&<div className="success" style={{marginTop:14}}>{message}</div>}
  <section className="card stack" style={{marginTop:14}}>
   <div className="row"><div><h2>🎬 게임 진행실</h2><p className="muted">게임은 별도 무대 화면에서 진행해. 여기서는 참가자와 관리자 기능만 관리해.</p></div><span className="pill">GAME ARENA</span></div>
   <button className="btn full" onClick={()=>router.push(`/host/${code}/play`)}>게임 진행 화면 열기 ↗</button>
  </section>
  <div className="grid2" style={{marginTop:14}}>
   <section className="card stack"><h2>포인트 수동 조정</h2><div className="field"><label>참가자</label><select value={selected} onChange={e=>setSelected(e.target.value)}>{participants.map(p=><option key={p.id} value={p.id}>{p.nickname} ({p.points.toLocaleString()}P)</option>)}</select></div><div className="field"><label>포인트 변경량 (+지급 / -차감)</label><input type="number" value={amount} onChange={e=>setAmount(e.target.value)}/></div><div className="field"><label>사유</label><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="예: 오목 대결 승리"/></div><button className="btn full" disabled={busy||!selected||!reason.trim()||!Number(amount)} onClick={()=>call("host_adjust_points",{playerId:selected,amount:Number(amount),reason})}>포인트 반영</button></section>
   <section className="card stack"><h2>비밀 미션 승인</h2>{pending.length===0?<p className="muted">확인 대기 중인 미션이 없어.</p>:pending.map(p=><div className="listitem" key={p.id}><div><b>{p.nickname}</b><div className="muted">{p.mission_title} · {p.mission_reward}P</div></div><div style={{display:"flex",gap:6}}><button className="btn" style={{padding:"9px 11px"}} onClick={()=>call("host_approve_mission",{playerId:p.id})}>승인</button><button className="btn danger" style={{padding:"9px 11px"}} onClick={()=>call("host_reject_mission",{playerId:p.id})}>반려</button></div></div>)}</section>
  </div>
  <section className="card" style={{marginTop:14}}><div className="row"><h2>참가자 및 순위</h2><span className="muted">{participants.length}/10명</span></div><div className="list">{sorted.map((p,i)=><div className="listitem" key={p.id}><div className="player"><div className="avatar">{i+1}</div><div><b>{p.nickname}</b><div className="muted">{p.is_host?"진행자":p.mission_status==="active"?"미션 수행 중":p.mission_status==="submitted"?"미션 확인 대기":p.mission_status==="approved"?"미션 성공":"미션 미선택"}</div></div></div><b>{p.points.toLocaleString()}P</b></div>)}</div></section>
  <section className="card stack" style={{marginTop:14}}><h2>전체 게임 순서</h2>{["비밀 미션 배정","주관식 퀴즈 7문제","홀짝 3라운드","비밀경매 1라운드 - 정답 +1,000P권","비밀경매 2라운드 - 베팅 무료권","악마의 더블업","OX 풀배당 5문제 (쿠폰 사용 불가)","가위바위보 토너먼트","자유 선택 게임","비밀 미션 정산 및 최종 우승자 발표"].map((x,i)=><div className="listitem" key={x}><span>{i+1}. {x}</span></div>)}<button className="btn danger full" disabled={busy||room?.status==="finished"} onClick={()=>{if(confirm("파티를 종료할까?"))call("host_finish")}}>파티 종료</button></section>
 </main>;
}
