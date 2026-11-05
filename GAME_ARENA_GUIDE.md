# PARTY POINT 화면 구성 업데이트

## 화면 주소
- 방장 대기실/관리: `/host/초대코드`
- 방장 게임 진행실: `/host/초대코드/play`
- 참가자 게임 화면: `/room/초대코드`

## 진행 방법
1. 방장은 대기실에서 참가자를 확인합니다.
2. 게임 시작을 누르면 방장 게임 진행실로 이동합니다.
3. 게임 진행실에서 전체 진행 순서, 문제 입력, 라운드 시작/마감/정산을 진행합니다.
4. 점수 지급, 미션 승인, 참가자 순위는 대기실의 관리자 영역에서 관리합니다.
5. 게임 진행 중 대기실로 돌아와도 게임 진행실 주소로 다시 이동할 수 있습니다.

기존 Supabase 테이블과 `.env.local`은 그대로 사용합니다. 이번 화면 분리만을 위한 SQL 변경은 없습니다.


## Separate game pages
- The game progress page now contains only the ordered game list and the next-game action.
- Each selected round opens `/host/[code]/play/game` as a dedicated full-screen arena.
- Subjective quiz questions are entered inside the quiz arena, not on the game progress page.
- OX questions and answers are entered inside the OX arena.
- After each game is settled, use the next-game button to return to the game list and continue the sequence.
- The arena uses a page-entry animation; player pages continue to receive the current game/quiz from the shared Supabase session.
