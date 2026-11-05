"use client";
import {useEffect,useState} from "react";

export default function GameStage({session,entries=[]}:{session:any;entries?:any[]}){
 const [pulse,setPulse]=useState(0);
 useEffect(()=>{const t=setInterval(()=>setPulse(v=>v+1),850);return()=>clearInterval(t)},[]);
 if(!session)return null;
 const key=session.game_key, data=session.public_data||{}, active=session.status==="active", closed=session.status==="closed", settled=session.status==="settled";
 const name=(e:any)=>Array.isArray(e.players)?e.players[0]?.nickname:e.players?.nickname||"참가자";
 const title:Record<string,string>={odd_even:"홀짝 운명의 사다리",secret_auction_1:"비밀 경매 · 황금 정답권",secret_auction_2:"비밀 경매 · 프리 베팅권",devil_double:"악마의 더블업",ox_pool:"O X 서바이벌",rps:"가위바위보 토너먼트",free_choice:"자유 선택 대결"};
 return <section className={`game-stage stage-${key}`}>
  <div className="stage-top"><span className="stage-live">{active?"● LIVE":closed?"결과 공개 대기":"GAME RESULT"}</span><span>{session.round_number?`ROUND ${session.round_number}`:"PARTY GAME"}</span></div>
  <h2 className="stage-title">{title[key]||session.game_title}</h2>
  {session.question&&<div className="stage-question">{session.question}</div>}
  {key==="odd_even"&&<><div className="ladder-arena"><div className="ladder-start">🎲</div><div className={`ladder-track ${closed||settled?"ladder-running":""}`}><i/><i/><i/><i/><i/><i/></div><div className="ladder-dest"><span className={settled&&data.outcome==="odd"?"dest-win":""}>홀</span><span className={settled&&data.outcome==="even"?"dest-win":""}>짝</span></div></div><div className="stage-caption">{settled?`운명의 결과는 ${data.outcome==="odd"?"홀":"짝"}!` : closed?"사다리가 내려가는 중...":"선택을 마치고 결과를 기다려!"}</div></>}
  {(key==="ox_pool")&&<><div className="ox-arena"><div className={`ox-tile ox-o ${settled&&data.answer==="O"?"correct":settled?"dim":""}`}>O</div><div className={`ox-tile ox-x ${settled&&data.answer==="X"?"correct":settled?"dim":""}`}>X</div></div><div className="stage-caption">{settled?`정답은 ${data.answer}!`:closed?"정답 공개까지 잠시만...":"정답을 선택하고 운명을 기다려!"}</div></>}
  {(key.startsWith("secret_auction"))&&<><div className="auction-hero"><div className="auction-gavel">🔨</div><div><small>현재 최고 입찰가</small><strong>{entries.length?Math.max(...entries.map(e=>Number(e.amount)||0)).toLocaleString():"—"}P</strong></div></div><div className="bid-list">{entries.length?entries.slice().sort((a,b)=>b.amount-a.amount).map((e:any,i)=><div className="bid-row" key={e.id}><span>{i===0?"👑":"🔹"} {name(e)}</span><b>{Number(e.amount).toLocaleString()}P</b></div>):<p>첫 입찰을 기다리는 중...</p>}</div>{settled&&<div className="stage-winner">🏆 낙찰자 {data.winner_nickname} · {Number(data.winning_bid||0).toLocaleString()}P</div>}<div className="stage-caption">{active?"비밀 입찰 진행 중 · 다른 사람의 입찰가는 비공개":"경매 마감! 최고가를 확인해봐"}</div></>}
  {key==="devil_double"&&<><div className={`devil-orb ${closed?"devil-pulse":""} ${settled?"devil-good":""}`}>{settled?"🎲":"?"}</div><div className="stage-caption">{settled?"참가자별 40% 확률 판정 완료":closed?"각자의 운명을 판정하는 중...":"각 참가자에게 독립적으로 40% 성공 확률 적용 · 성공 시 총 2,500P 지급"}</div>{settled&&data.player_results&&<div className="bid-list">{Object.entries(data.player_results as Record<string,{success:boolean;nickname:string}>).map(([id,result])=><div className="bid-row" key={id}><span>{result.nickname}</span><b style={{color:result.success?"#4ade80":"#fb7185"}}>{result.success?"성공 +2,500P":"실패"}</b></div>)}</div>}</>}
  {(key==="rps"||key==="free_choice")&&<><div className="tournament-arena"><div className="tournament-side">{entries.slice(0,Math.ceil(entries.length/2)).map((e:any)=><span key={e.id}>{name(e)}</span>)}</div><div className="tournament-vs">VS</div><div className="tournament-side">{entries.slice(Math.ceil(entries.length/2)).map((e:any)=><span key={e.id}>{name(e)}</span>)}</div></div>{settled&&<div className="stage-winner">🏆 {data.winner_nickname||"우승자"} 우승!</div>}<div className="stage-caption">{active?`${entries.length}명 참가 · 대진을 기다리는 중`:closed?"토너먼트 결과 발표 대기":"최종 결과"}</div></>}
  <div className="stage-footer"><span>{active?"참가 접수 중":closed?"마감 완료":"정산 완료"}</span><span className="stage-dots">{[0,1,2].map(n=><i key={n} className={pulse%3===n?"on":""}/>)}</span></div>
 </section>
}
