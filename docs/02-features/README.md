# 기능 문서

현재 소스와 자동 테스트에서 확인한 동작을 정리합니다. 문서 작성일은 2026-11-06이며 기준 버전은 `package.json`의 1.10.1입니다. 운영 서버에 실제 반영되었는지는 별도로 확인해야 합니다.

| 문서 | 확인할 내용 |
|---|---|
| [장소 예약](reservation.md) | 시간 규칙, 즉시·자동 오픈, 예약 정렬·취소 |
| [계정과 권한](accounts-and-permissions.md) | 대표 계정 승인, 관리자 인증, 역할별 접근 범위 |
| [동아리 관리](club-management.md) | 프로필, 임원 정보, 배치도·방 배정 |
| [벌점과 사진 확인](penalties-and-photos.md) | 사진 제출 상태, 일일 중복 방지, 벌점 취소 |
| [예약 접근과 조회](booking-access.md) | 대여 단독 이용, 조회 계정·기간제 링크, 시간표 |

화면 진입 경로는 [UI/UX](../06-uiux/README.md), 데이터 구조는 [데이터베이스](../05-database/README.md), 구현 연결 관계는 [아키텍처](../03-architecture/README.md)를 참고하세요.

## 기능 도입 당시 기록

아래 파일은 과거 배포·적용 안내를 원문으로 보존한 기록입니다. 문서 속 테스트 개수와 운영 확인 여부는 해당 작성 시점의 보고이며 이번 문서화에서 재수행한 결과가 아닙니다. 특히 과거의 **10분 만료, 계정 비밀번호 원문 조회, 다른 기기 로그인 시 기존 접속 종료** 설명은 현재 사양으로 사용하지 마세요. 현재 메인 관리자 정책은 **15분 미사용·최대 8시간**, 대표 계정 비밀번호는 **원문 조회 불가**, 대표 계정은 **다중 로그인·대여 권한만 단독 사용**입니다.

- [ACCOUNTS_UPDATE.md](history/ACCOUNTS_UPDATE.md): 대표 계정 도입·승인·발급 기록
- [BOOKING_HISTORY_UPDATE.md](history/BOOKING_HISTORY_UPDATE.md): 전체 예약 내역과 관리자 정렬
- [CLUB_EDITOR_UPDATE.md](history/CLUB_EDITOR_UPDATE.md): 등록·수정 팝업
- [CLUB_PORTAL_UPDATE.md](history/CLUB_PORTAL_UPDATE.md): 내 동아리 포털 도입
- [CLUB_PROFILE_UPDATE.md](history/CLUB_PROFILE_UPDATE.md): 상태·분과·운영 정보
- [PHOTO_SESSION_UPDATE.md](history/PHOTO_SESSION_UPDATE.md): 사진 통합 버튼·15분 정책
- [RENTAL_ACCESS_UPDATE.md](history/RENTAL_ACCESS_UPDATE.md): 다중 접속과 장소대여 단독 권한
- [READ_ACCESS_UPDATE.md](history/READ_ACCESS_UPDATE.md): 조회 계정·링크와 만료 기간
- [SCHEDULED_OPENING_UPDATE.md](history/SCHEDULED_OPENING_UPDATE.md): 한국시간 자동 오픈

근거: [버전·명령](../../package.json), [기능 분기](../../lib/service.mjs), [계정](../../lib/accounts.mjs), [관리자 인증](../../lib/admin-auth.mjs), [조회 접근](../../lib/reservation-read.mjs).
