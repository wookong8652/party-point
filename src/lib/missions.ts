export const MISSIONS = [
  // 쉬움 · 300P
  {level:"easy",title:"하이파이브",description:"서로 다른 사람 2명과 하이파이브 하세요.",reward:300},
  {level:"easy",title:"물건 빌리기",description:"다른 사람에게 물건을 1번 빌리세요.",reward:300},
  {level:"easy",title:"칭찬하기",description:"서로 다른 사람 2명에게 칭찬을 해주세요.",reward:300},
  {level:"easy",title:"화장실 다녀오기",description:"파티 중 화장실에 한 번 다녀오세요.",reward:300},
  {level:"easy",title:"술 따르다 흘리기",description:"친구에게 술을 따라주다가 잔에 들어가기 전 술을 잔 용량의 3분의 1 이상 흘리세요. 일부러 바닥에 붓거나 다른 사람에게 피해를 주지 마세요.",reward:300},

  // 보통 · 500P
  {level:"normal",title:"술잔 엎기",description:"소주가 들어 있는 잔 하나를 실수로 엎으세요. 다른 사람이나 전자기기 쪽으로 쏟지 말고 안전하게 정리하세요.",reward:500},
  {level:"normal",title:"화이트보드 흔적 남기기",description:"화이트보드에 글씨나 그림 등 나만의 흔적을 남기세요.",reward:500},
  {level:"normal",title:"노래 흥얼거리기",description:"콧노래가 아닌 목소리로 노래를 5초 이상 흥얼거리세요.",reward:500},
  {level:"normal",title:"한 사람씩 술 따라주기",description:"모든 사람에게 술을 한잔씩 따라주세요.",reward:500},
  {level:"normal",title:"빗으로 머리 빗기",description:"빗으로 본인의 머리를 빗으세요.",reward:500},
  {level:"normal",title:"고마워 듣기",description:"서로 다른 사람 2명에게 '고마워' 또는 '땡큐'라는 말을 들으세요.",reward:500},

  // 어려움 · 1,000P
  {level:"hard",title:"일어나서 박수 3회",description:"자리에서 한 번 일어난 뒤 박수를 3회 이상 치세요. 세 번 일어나는 것이 아닙니다.",reward:1000},
  {level:"hard",title:"사진 3장 찍기",description:"화면 캡처가 아닌 실제 사진을 3장 이상 촬영하세요.",reward:1000},
  {level:"hard",title:"플레이리스트 바꾸기",description:"재생 중인 음악의 플레이리스트를 다른 플레이리스트로 바꾸세요.",reward:1000},
  {level:"hard",title:"자리의 사람에게 전화하기",description:"생일자를 제외하고 그 자리에 있는 사람 한 명에게 전화하세요. 통화 연결음이 한 번 이상 들리면 성공입니다.",reward:1000},
  {level:"hard",title:"아우터 앞뒤 바꿔 입기",description:"파티에 입고 온 아우터를 앞으로 입었다가 다시 벗으세요.",reward:1000},
  {level:"hard",title:"팔벌려뛰기 3회",description:"일어나서 팔벌려뛰기 3회를 성공하세요.",reward:1000},
  {level:"hard",title:"똥마렵다고 말하기",description:"파티 중 '똥 마렵다'라고 3번 말하세요.",reward:1000}
] as const;

export type MissionLevel = "easy" | "normal" | "hard";
export const LEVEL_LABEL:Record<MissionLevel,string>={easy:"쉬움",normal:"보통",hard:"어려움"};
