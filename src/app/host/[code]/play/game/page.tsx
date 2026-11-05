"use client";
import {useCallback,useEffect,useState} from "react";
import {useParams,useRouter,useSearchParams} from "next/navigation";
import GameStage from "@/components/GameStage";
import {supabase} from "@/lib/supabase";

export default function GamePage(){
 const {code:raw}=useParams<{code:string}>(),code=raw.toUpperCase(),router=useRouter(),sp=useSearchParams();
 const kind=sp.get("kind")||"game",key=sp.get("key")||"",roundNo=Number(sp.get("round")||1),step=Number(sp.get("step")||0);
 const [session,setSession]=useState<any>(null),[entries,setEntries]=useState<any[]>([]),[round,setRound]=useState<any>(null),[answers,setAnswers]=useState<any[]>([]);
 const [question,setQuestion]=useState(""),[oxAnswer,setOxAnswer]=useState("O"),[winnerId,setWinnerId]=useState(""),[runnerId,setRunnerId]=useState(""),[reward,setReward]=useState("1000"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const hostToken=()=>sessionStorage.getItem(`party-host-${code}`)||"";
 const api=useCallback(async(action:string,extra:any={})=>{const r=await fetch("/api/game",{method:"POST",headers:{"Content-Type":"application/json","x-host-token":hostToken()},body:JSON.stringify({action,code,...extra})});const d=await r.json();if(!r.ok)throw new Error(d.error||"요청 실패");return d},[code]);
 const refresh=useCallback(async()=>{
  if(kind==="quiz"){const d=await api("host_get_active_round");setRound(d.round);if(d.round){const a=await api("host_get_quiz_answers",{roundId:d.round.id});setAnswers(a.answers||[])}}
  else {const d=await api("host_get_current_game");setSession(d.session);if(d.session){const e=await api("host_get_game_entries",{sessionId:d.session.id});setEntries(e.entries||[])}}
 },[api,kind]);
 useEffect(()=>{refresh();const t=setInterval(refresh,2000);return()=>clearInterval(t)},[refresh]);
 async function act(fn:()=>Promise<any>,success:string){setBusy(true);setError("");try{await fn();setMessage(success);await refresh()}catch(e){setError(e instanceof Error?e.message:"처리 실패")}finally{setBusy(false)}}
 async function startQuiz(){await act(async()=>{await api("host_start_quiz_round",{question,roundNumber:roundNo});setQuestion("")},"문제가 참가자 화면에 공개됐어!")}
 async function startOx(){await act(async()=>{await api("host_create_game",{gameKey:"ox_pool",question,answer:oxAnswer,roundNumber:roundNo})},"OX 게임 시작!")}
 async function finish(){
  const storageKey=`party-flow-${code}`;
  const saved=JSON.parse(localStorage.getItem(storageKey)||"{}");
  localStorage.setItem(storageKey,JSON.stringify({...saved,index:step+1,started:true,done:false}));
  router.push(`/host/${code}/play`);
 }
 const name=(a:any)=>Array.isArray(a.players)?a.players[0]?.nickname:a.players?.nickname||"참가자";
 return <main className="page game-fullscreen">
  <div className="row"><div className="brand">🎮 PARTY POINT · LIVE ARENA</div><button className="btn secondary" onClick={()=>router.push(`/host/${code}/play`)}>게임 진행 목록</button></div>
  <div className="hero"><div className="eyebrow">ROUND {roundNo} · LIVE SHOW</div><h1>{kind==="quiz"?"주관식 퀴즈":kind==="ox"?"OX 서바이벌":session?.game_title||"게임 무대"}</h1><p>참가자 화면에도 같은 게임 무대가 표시돼.</p></div>
  {error&&<div className="error">{error}</div>}{message&&<div className="success">{message}</div>}
  {kind==="quiz"&&<section className="game-stage quiz-stage stack">
   <div className="stage-top"><span className="stage-live">● QUIZ LIVE</span><span>{round?`${round.round_number}/7 QUESTION`:`${roundNo}/7 QUESTION`}</span></div>
   {round&&Number(round.round_number)===roundNo?<><h2 className="stage-title">{round.question}</h2><div className="stage-caption">{round.status==="answering"?"참가자 답변 접수 중 · 원하는 때 마감 가능":"방장이 답변을 마감했어 · 채점 진행"}</div></>:<><h2 className="stage-title">이번 문제를 출제하세요</h2><div className="field"><label>참가자에게 보여줄 문제</label><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="문제를 입력해줘."/></div><button className="btn full" disabled={busy||!question.trim()} onClick={startQuiz}>문제 공개하고 답변 받기</button></>}
   {round&&Number(round.round_number)===roundNo&&<><div className="row"><b>참가자 답변 {answers.length}명</b><button className="btn secondary" onClick={refresh}>새로고침</button></div>{answers.map(a=><div className="listitem" key={a.id}><div><b>{name(a)}</b><div className="muted">{a.answer}</div></div>{!a.judged&&<div className="row"><button className="btn" disabled={busy} onClick={()=>act(()=>api("host_grade_quiz_answer",{answerId:a.id,correct:true,reward:300}),"정답 처리 완료")}>정답 +300P</button><button className="btn danger" disabled={busy} onClick={()=>act(()=>api("host_grade_quiz_answer",{answerId:a.id,correct:false,reward:300}),"오답 처리 완료")}>오답</button></div>}</div>)}{round.status==="answering"&&<button className="btn secondary full" disabled={busy} onClick={()=>act(()=>api("host_close_quiz_round",{roundId:round.id}),"답변 마감")}>답변 제출 마감</button>}<button className="btn full" disabled={busy||round.status==="answering"} onClick={finish}>다음 게임으로 이동 →</button></>}
  </section>}
  {kind==="ox"&&<section className="game-stage stack">
   {(!session||session.game_key!=="ox_pool"||Number(session.round_number)!==roundNo)?<><h2 className="stage-title">OX 문제 출제</h2><div className="ox-arena"><div className="ox-tile ox-o">O</div><div className="ox-tile ox-x">X</div></div><div className="field"><label>문제</label><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="OX 문제를 입력해줘."/></div><div className="field"><label>정답</label><select value={oxAnswer} onChange={e=>setOxAnswer(e.target.value)}><option value="O">O</option><option value="X">X</option></select></div><button className="btn full" disabled={busy||!question.trim()} onClick={startOx}>문제 공개하고 게임 시작</button></>:<><GameStage session={session} entries={entries}/><div className="row"><b>참가자 {entries.length}명</b>{session.status==="active"&&<button className="btn secondary" onClick={()=>act(()=>api("host_close_game",{sessionId:session.id}),"참가 마감")}>참가 마감</button>}</div>{session.status==="closed"&&<button className="btn full" disabled={busy} onClick={()=>act(()=>api("host_settle_game",{sessionId:session.id}),"정답 공개 및 정산 완료")}>정답 공개 및 정산</button>}{session.status==="settled"&&<button className="btn full" onClick={finish}>다음 게임으로 →</button>}</>}
  </section>}
  {kind==="game"&&session&&<section className="game-stage stack"><GameStage session={session} entries={entries}/><div className="row"><b>참가자 {entries.length}명</b>{session.status==="active"&&<button className="btn secondary" disabled={busy} onClick={()=>act(()=>api("host_close_game",{sessionId:session.id}),"참가 마감 완료")}>참가 마감</button>}</div>{session.status==="closed"&&<>{(session.game_key==="rps"||session.game_key==="free_choice")&&<><div className="field"><label>우승자</label><select value={winnerId} onChange={e=>setWinnerId(e.target.value)}><option value="">우승자 선택</option>{entries.map(e=><option key={e.player_id} value={e.player_id}>{name(e)}</option>)}</select></div>{session.game_key==="rps"?<div className="field"><label>준우승자</label><select value={runnerId} onChange={e=>setRunnerId(e.target.value)}><option value="">준우승자 선택</option>{entries.map(e=><option key={e.player_id} value={e.player_id}>{name(e)}</option>)}</select></div>:<div className="field"><label>우승 보상 포인트</label><input type="number" value={reward} onChange={e=>setReward(e.target.value)}/></div>}</>}<button className="btn full" disabled={busy||((session.game_key==="rps"||session.game_key==="free_choice")&&(!winnerId||(session.game_key==="rps"&&!runnerId)))} onClick={()=>act(()=>api("host_settle_game",{sessionId:session.id,winnerId,runnerUpId:runnerId,reward:Number(reward)}),"결과 공개 및 포인트 정산 완료")}>결과 공개 및 정산</button></>}{session.status==="settled"&&<button className="btn full" onClick={finish}>다음 게임으로 이동 →</button>}</section>}
  {!session&&kind==="game"&&<div className="notice">게임 정보를 불러오는 중이야.</div>}
 </main>
}
