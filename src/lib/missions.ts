export const MISSIONS = [
  {level:"easy",title:"자연스러운 건배",description:"다른 사람과 건배를 총 3번 하세요.",reward:300},
  {level:"easy",title:"몰래 박수",description:"대화 중 자연스럽게 박수를 3번 치세요.",reward:300},
  {level:"easy",title:"하이파이브",description:"서로 다른 사람 2명과 하이파이브 하세요.",reward:300},
  {level:"easy",title:"물건 빌리기",description:"다른 사람에게 물건을 2번 빌리세요.",reward:300},
  {level:"easy",title:"가위바위보",description:"다른 사람 3명과 가위바위보를 하세요.",reward:300},
  {level:"easy",title:"자리 이동",description:"파티 중 자리를 2번 바꾸세요.",reward:300},
  {level:"easy",title:"칭찬하기",description:"서로 다른 사람 2명에게 칭찬을 해주세요.",reward:300},
  {level:"normal",title:"웃음 전염",description:"다른 사람 3명을 각각 웃게 만드세요.",reward:500},
  {level:"normal",title:"따라 하기",description:"다른 사람이 내가 한 행동을 2번 따라 하게 만드세요.",reward:500},
  {level:"normal",title:"건배 주도",description:"다른 사람 3명이 함께 건배하도록 만드세요.",reward:500},
  {level:"normal",title:"자연스러운 질문",description:"서로 다른 사람 2명에게 먼저 질문을 받으세요.",reward:500},
  {level:"normal",title:"질문 유도",description:"다른 사람이 먼저 나에게 질문을 총 3번 하게 만드세요.",reward:500},
  {level:"normal",title:"단어 전파",description:"내가 사용한 단어를 다른 사람 2명이 따라 사용하게 만드세요.",reward:500},
  {level:"normal",title:"단체 사진",description:"다른 사람 4명 이상과 단체 사진을 찍으세요.",reward:500},
  {level:"normal",title:"대화 주도권",description:"다른 사람이 먼저 내 의견을 물어보게 만드세요.",reward:500},
  {level:"hard",title:"몰래 따라 하기",description:"다른 사람 3명이 내가 한 행동을 각각 따라 하게 만드세요.",reward:1000},
  {level:"hard",title:"연쇄 하이파이브",description:"서로 다른 사람 4명과 연속으로 하이파이브 하세요.",reward:1000},
  {level:"hard",title:"자발적 건배",description:"내가 먼저 제안하지 않고 다른 사람 3명이 건배를 제안하게 만드세요.",reward:1000},
  {level:"hard",title:"웃음 참기",description:"다른 사람 3명을 웃게 만들고 본인은 웃지 마세요.",reward:1000},
  {level:"hard",title:"단체 행동 유도",description:"다른 사람 5명이 동시에 같은 행동을 하게 만드세요.",reward:1000},
  {level:"hard",title:"자연스러운 노래 신청",description:"다른 사람 2명에게 각각 노래 신청을 받으세요.",reward:1000},
  {level:"hard",title:"대화 연결",description:"서로 다른 사람 4명이 내 말에 연속으로 반응하게 만드세요.",reward:1000},
  {level:"hard",title:"몰래 주도하기",description:"다른 사람 3명이 내가 제안한 행동을 자발적으로 실행하게 만드세요.",reward:1000}
] as const;
export type MissionLevel = "easy" | "normal" | "hard";
export const LEVEL_LABEL:Record<MissionLevel,string>={easy:"쉬움",normal:"보통",hard:"어려움"};
