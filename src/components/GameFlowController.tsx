"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Step={key:string;title:string;kind:"quiz"|"game"|"ox";round:number};
const STEPS:Step[]=[
 ...Array.from({length:7},(_,i)=>({key:"subjective_quiz",title:`주관식 퀴즈 ${i+1}/7`,kind:"quiz" as const,round:i+1})),
 ...Array.from({length:3},(_,i)=>({key:"odd_even",title:`홀짝 ${i+1}/3`,kind:"game" as const,round:i+1})),
 {key:"secret_auction_1",title:"비밀 경매 · 정답 보너스권",kind:"game",round:1},
 {key:"secret_auction_2",title:"비밀 경매 · 무료 베팅권",kind:"game",round:2},
 {key:"devil_double",title:"악마의 더블업",kind:"game",round:1},
 ...Array.from({length:5},(_,i)=>({key:"ox_pool",title:`OX 퀴즈 ${i+1}/5`,kind:"ox" as const,round:i+1})),
 {key:"rps",title:"가위바위보 토너먼트",kind:"game",round:1},
 {key:"free_choice",title:"자유 선택 게임",kind:"game",round:1}
];
export default function GameFlowController({code,api,onMessage,onError}:{code:string;api:(action:string,extra?:any)=>Promise<any>;onMessage:(v:string)=>void;onError:(v:string)=>void}){
 const router=useRouter(),storageKey=`party-flow-${code}`;
 const [index,setIndex]=useState(0),[started,setStarted]=useState(false),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[standings,setStandings]=useState<any[]>([]);
 useEffect(()=>{try{const s=JSON.parse(localStorage.getItem(storageKey)||"null");if(s){setIndex(Math.min(s.index||0,STEPS.length-1));setStarted(!!s.started);setDone(!!s.done)}}catch{}},[storageKey]);
 useEffect(()=>{localStorage.setItem(storageKey,JSON.stringify({index,started,done}))},[storageKey,index,started,done]);
 const step=STEPS[index];
 async function begin(){
  setBusy(true);onError("");
  try{
   const quizCurrent=await api("host_get_active_round");
   if(quizCurrent.round && ["answering","closed"].includes(quizCurrent.round.status)){
    const quizStep=STEPS.findIndex(x=>x.kind==="quiz" && x.round===Number(quizCurrent.round.round_number));
    if(quizStep>=0){setIndex(quizStep);localStorage.setItem(storageKey,JSON.stringify({index:quizStep,started:true,done:false}));}
    router.push(`/host/${code}/play/game?kind=quiz&round=${quizCurrent.round.round_number}&step=${Math.max(quizStep,0)}`);
    return;
   }
   const current=await api("host_get_current_game");
   if(current.session && ["active","closed"].includes(current.session.status)){
    const existing=current.session;
    const match=STEPS.findIndex(x=>x.key===existing.game_key && x.round===Number(existing.round_number||1));
    if(match>=0){setIndex(match);localStorage.setItem(storageKey,JSON.stringify({index:match,started:true,done:false}));}
    const targetKind=existing.game_key==="ox_pool"?"ox":"game";
    router.push(`/host/${code}/play/game?kind=${targetKind}&key=${existing.game_key}&round=${existing.round_number||1}&step=${Math.max(match,0)}`);
    return;
   }
   if(step.kind==="quiz"){
    setStarted(true);
    router.push(`/host/${code}/play/game?kind=quiz&round=${step.round}&step=${index}`);
    return;
   }
   if(step.kind==="ox"){
    setStarted(true);
    router.push(`/host/${code}/play/game?kind=ox&round=${step.round}&step=${index}`);
    return;
   }
   await api("host_create_game",{gameKey:step.key,question:"",answer:"O",roundNumber:step.round});
   setStarted(true);
   router.push(`/host/${code}/play/game?kind=game&key=${step.key}&round=${step.round}&step=${index}`);
  }catch(e){onError(e instanceof Error?e.message:"게임 시작에 실패했어.");}
  finally{setBusy(false)}
 }
 return <section className="card stack flow-controller">
  <div className="row"><div><h2>🎬 전체 게임 진행</h2><p className="muted">게임을 선택하면 전용 무대로 이동해.</p></div><span className="pill">{done?"완료":`${index+1}/${STEPS.length}`}</span></div>
  <div className="flow-progress"><div style={{width:`${done?100:index/STEPS.length*100}%`}}/></div>
  {!done?<><div className="flow-current"><span className="muted">다음 게임</span><strong>{step.title}</strong><p>시작 버튼을 누르면 전체 화면 게임 무대로 전환돼.</p></div><div className="flow-list">{STEPS.map((s,i)=><div className={`flow-step ${i===index?"current":i<index?"passed":""}`} key={`${s.key}-${s.round}`}><span>{i<index?"✓":i+1}</span><b>{s.title}</b></div>)}</div><button className="btn full" disabled={busy} onClick={begin}>{busy?"게임 준비 중...":`${step.title} 시작하기 →`}</button></>:<div className="success">모든 게임을 완료했어.</div>{standings.length>0&&<div className="card stack"><h2>🏆 최종 우승자</h2><h1>{standings[0].nickname}</h1><strong>{Number(standings[0].points).toLocaleString()}P</strong>{standings.map((p,i)=><div className="listitem" key={p.id}><span>{i+1}위 · {p.nickname}</span><b>{Number(p.points).toLocaleString()}P</b></div>)}</div>}}
  <div className="row"><button className="btn secondary" disabled={index===0||busy} onClick={()=>setIndex(v=>v-1)}>이전 순서</button><button className="btn secondary" disabled={busy} onClick={async()=>{if(index===STEPS.length-1){setBusy(true);try{const result=await api("host_finish");setStandings(result.standings||[]);setDone(true);}catch(e){onError(e instanceof Error?e.message:"파티 종료 실패");}finally{setBusy(false)}}else setIndex(v=>v+1)}}>{index===STEPS.length-1?"파티 종료 및 최종 우승자 발표":"다음 순서로 건너뛰기"}</button></div>
 </section>;
}
