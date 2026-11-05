"use client";
import {useCallback,useState} from "react";
import {useParams,useRouter} from "next/navigation";
import GameFlowController from "@/components/GameFlowController";

export default function PlayPage(){
 const {code:raw}=useParams<{code:string}>(),code=raw.toUpperCase(),router=useRouter();
 const [error,setError]=useState(""),[message,setMessage]=useState("");
 const hostToken=()=>sessionStorage.getItem(`party-host-${code}`)||"";
 const api=useCallback(async(action:string,extra:any={})=>{
  const r=await fetch("/api/game",{method:"POST",headers:{"Content-Type":"application/json","x-host-token":hostToken()},body:JSON.stringify({action,code,...extra})});
  const d=await r.json();if(!r.ok)throw new Error(d.error||"요청 실패");return d;
 },[code]);
 return <main className="page">
  <div className="row"><div className="brand">🎮 PARTY POINT · GAME ARENA</div><button className="btn secondary" onClick={()=>router.push(`/host/${code}`)}>대기실 / 관리 화면</button></div>
  <div className="hero"><div className="eyebrow">LIVE GAME ARENA · {code}</div><h1>게임 진행실</h1><p>다음 게임을 시작하면 전용 무대로 전환돼.</p></div>
  {error&&<div className="error">{error}</div>}{message&&<div className="success">{message}</div>}
  <GameFlowController code={code} api={api} onMessage={setMessage} onError={setError}/>
 </main>;
}
