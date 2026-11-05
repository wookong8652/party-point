"use client";
import {useEffect,useState} from "react";

export default function GameStage({session,entries=[],pool=null}:{session:any;entries?:any[];pool?:any}){
 const [pulse,setPulse]=useState(0);
 useEffect(()=>{const t=setInterval(()=>setPulse(v=>v+1),850);return()=>clearInterval(t)},[]);
 if(!session)return null;
 const key=session.game_key, data=session.public_data||{}, active=session.status==="active", closed=session.status==="closed", settled=session.status==="settled";
 const name=(e:any)=>Array.isArray(e.players)?e.players[0]?.nickname:e.players?.nickname||"참가자";
 const title:Record<string,string>={odd_even:"홀짝 운명의 사다리",secret_auction_1:"비밀 경매 · 황금 정답권",secret_auction_2:"비밀 경매 · 프리 베팅권",devil_double:"악마의 더블업",ox_pool:"O X 서바이벌",rps:"가위바위보 토너먼트",free_choice:"자유 선택 대결"};
 const rules:Record<string,string>={
  subjective_quiz:"정답을 맞히면 300P를 받아. 오답은 포인트 변동이 없어. 정답 +1,000P 쿠폰이 있으면 보상이 추가돼.",
  odd_even:"100~1,000P를 홀 또는 짝에 베팅해. 맞히면 베팅 원금이 포함된 2배를 돌려받고, 틀리면 베팅금은 소멸해.",
  secret_auction_1:"비밀 입찰에서 가장 높은 금액을 제시한 사람만 낙찰돼. 낙찰자만 입찰 금액을 지불하고 정답 시 +1,000P 쿠폰을 받아. 패찰자는 포인트가 차감되지 않아.",
  secret_auction_2:"비밀 입찰에서 가장 높은 금액을 제시한 사람만 낙찰돼. 낙찰자만 입찰 금액을 지불하고 홀짝 1회 베팅 무료권을 받아. 패찰자는 포인트가 차감되지 않아.",
  devil_double:"참여는 선택 사항이야. 참여자는 1,000P를 걸고 각자 독립적인 40% 확률로 도전해. 성공하면 총 2,500P를 받고, 실패하면 1,000P를 잃어. 불참은 포인트 변동이 없어.",
  ox_pool:"O 또는 X에 100~1,000P를 베팅해. 정답자는 원금과 오답자 베팅 풀의 비례 배당을 받아. 전원 정답이면 원금만 반환되고, 전원 오답이면 베팅금은 소멸해.",
  rps:"참가비는 없어. 토너먼트 우승자는 1,000P, 준우승자는 500P를 받아. 나머지 참가자는 추가 포인트를 받지 않아.",
  free_choice:"진행자가 선택한 게임의 규칙과 보상 기준을 그대로 적용해.",
 };
 return <section className={`game-stage stage-${key}`}>
  <div className="stage-top"><span className="stage-live">{active?"● LIVE":closed?"결과 공개 대기":"GAME RESULT"}</span><span>{session.round_number?`ROUND ${session.round_number}`:"PARTY GAME"}</span></div>
  <h2 className="stage-title">{title[key]||session.game_title}</h2>
  {session.question&&<div className="stage-question">{session.question}</div>}
  {rules[key]&&<div className="notice stage-rules"><b>게임 규칙 · 포인트 안내</b><p>{rules[key]}</p></div>}
  {key==="odd_even"&&<><div className="ladder-arena"><div className="ladder-start">🎲</div><div className={`ladder-track ${closed||settled?"ladder-running":""}`}><i/><i/><i/><i/><i/><i/></div><div className="ladder-dest"><span className={settled&&data.outcome==="odd"?"dest-win":""}>홀</span><span className={settled&&data.outcome==="even"?"dest-win":""}>짝</span></div></div><div className="stage-caption">{settled?`운명의 결과는 ${data.outcome==="odd"?"홀":"짝"}!` : closed?"사다리가 내려가는 중...":"선택을 마치고 결과를 기다려!"}</div></>}
  {(key==="ox_pool")&&(()=>{const o=pool?.oPool??entries.filter((e:any)=>String(e.choice).toUpperCase()==="O").reduce((n:number,e:any)=>n+Number(e.amount||0),0);const x=pool?.xPool??entries.filter((e:any)=>String(e.choice).toUpperCase()==="X").reduce((n:number,e:any)=>n+Number(e.amount||0),0);const total=o+x;const pct=(v:number)=>total?Math.round(v/total*100):0;return <><div className="ox-arena"><div className={`ox-tile ox-o ${settled&&data.answer==="O"?"correct":settled?"dim":""}`}>O</div><div className={`ox-tile ox-x ${settled&&data.answer==="X"?"correct":settled?"dim":""}`}>X</div></div><div className="grid2"><div className="notice"><b>O 베팅 풀</b><h2>{o.toLocaleString()}P</h2><span>{pct(o)}%</span>{pool?.oMultiplier&&<p>예상 {pool.oMultiplier}배</p>}</div><div className="notice"><b>X 베팅 풀</b><h2>{x.toLocaleString()}P</h2><span>{pct(x)}%</span>{pool?.xMultiplier&&<p>예상 {pool.xMultiplier}배</p>}</div></div><div className="notice stack"><b>전체 참가자 베팅 내역</b>{(pool?.bets||entries).length===0?<span>아직 베팅한 참가자가 없어.</span>:(pool?.bets||entries).map((e:any)=><div className="row" key={e.playerId||e.player_id}><span>{e.nickname||name(e)} · {String(e.choice).toUpperCase()} · {e.poolSharePercent!==undefined?`${e.poolSharePercent}%`:total?`${(Number(e.amount||0)/total*100).toFixed(1)}%`:'0%'}</span><b>{Number(e.amount||0).toLocaleString()}P</b></div>)}</div><div className="stage-caption">{settled?`정답은 ${data.answer}!`:closed?"정답 공개까지 잠시만...":"베팅 규모에 따라 예상 배당이 실시간으로 변해!"}</div></>})()}
  {(key.startsWith("secret_auction"))&&<><div className="auction-hero"><div className="auction-gavel">🔨</div><div><small>현재 최고 입찰가</small><strong>{entries.length?Math.max(...entries.map(e=>Number(e.amount)||0)).toLocaleString():"—"}P</strong></div></div><div className="bid-list">{entries.length?entries.slice().sort((a,b)=>b.amount-a.amount).map((e:any,i)=><div className="bid-row" key={e.id}><span>{i===0?"👑":"🔹"} {name(e)}</span><b>{Number(e.amount).toLocaleString()}P</b></div>):<p>첫 입찰을 기다리는 중...</p>}</div>{settled&&<div className="stage-winner">🏆 낙찰자 {data.winner_nickname} · {Number(data.winning_bid||0).toLocaleString()}P</div>}<div className="stage-caption">{active?"비밀 입찰 진행 중 · 다른 사람의 입찰가는 비공개":"경매 마감! 최고가를 확인해봐"}</div></>}
  {key==="devil_double"&&<><div className={`devil-orb ${closed?"devil-pulse":""} ${settled?"devil-good":""}`}>{settled?"🎲":"?"}</div><div className="stage-caption">{settled?"참가자별 40% 확률 판정 완료":closed?"각자의 운명을 판정하는 중...":"각 참가자에게 독립적으로 40% 성공 확률 적용 · 성공 시 총 2,500P 지급"}</div>{settled&&data.player_results&&<div className="bid-list">{Object.entries(data.player_results as Record<string,{participated?:boolean;success:boolean;nickname:string}>).map(([id,result])=><div className="bid-row" key={id}><span>{result.nickname}</span><b style={{color:result.success?"#4ade80":"#fb7185"}}>{!result.participated?"불참":result.success?"성공 +2,500P":"실패"}</b></div>)}</div>}</>}
  {key==="rps"&&<><div className="rps-bracket">{(data.bracket?.rounds||[]).map((round:any,ri:number)=><div className="rps-round" key={round.round}><h3>{round.round===1?"1라운드":round.round===2?"준결승":round.round===3?"결승":`${round.round}라운드`}</h3>{round.matches.map((match:any)=><div className="rps-match" key={match.id}><div className={match.winner_id===match.player1?.id?"rps-winner":""}>{match.player1?.nickname||"BYE"}</div><div className={match.winner_id===match.player2?.id?"rps-winner":""}>{match.player2?.nickname||"부전승"}{match.winner_id===match.player1?.id?" ✓":match.winner_id===match.player2?.id?" ✓":""}</div></div>)}</div>)}</div>{settled&&<div className="stage-winner">🏆 우승 {data.winner_nickname||"우승자"} · 준우승 {data.runner_up_nickname||"준우승자"}<br/><small>우승 +1,000P · 준우승 +500P</small></div>}<div className="stage-caption">{active?`${entries.length}명 참가 · 참가 마감 후 대진표 공개`:closed?"대진별 승자를 선택해 다음 라운드로 진행해":"토너먼트 최종 결과"}</div></>}
  {key==="free_choice"&&<div className="stage-caption">진행자가 다시 할 게임을 선택하는 중이야.</div>}
  <div className="stage-footer"><span>{active?"참가 접수 중":closed?"마감 완료":"정산 완료"}</span><span className="stage-dots">{[0,1,2].map(n=><i key={n} className={pulse%3===n?"on":""}/>)}</span></div>
 </section>
}
