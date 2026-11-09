# 문서 이전표와 유지보수

## 원문 조사와 실제 이전

기준 커밋 `5ee7101`의 루트 Markdown 16개를 조사했습니다. 아래 파일은 복제가 아니라 `git mv`를 통한 실제 이전입니다. 기존 README는 설치·업데이트 정보의 손실을 막기 위해 원문 이력으로 보존하고 루트 진입 문서를 새로 작성했습니다.

| 기존 루트 문서 | 새 위치 | 분류 근거 |
|---|---|---|
| README.md | [README-v1.10.1.md](../01-overview/history/README-v1.10.1.md) | 기존 설치·누적 배포 안내 원문; 루트에는 새 요약 README 유지 |
| ACCOUNTS_UPDATE.md | [계정 기록](../02-features/history/ACCOUNTS_UPDATE.md) | 대표 가입·관리자 승인·이전 계정 전환 |
| BOOKING_HISTORY_UPDATE.md | [예약 이력 기록](../02-features/history/BOOKING_HISTORY_UPDATE.md) | 우리 동아리 예약·정렬·페이지 |
| CLUB_EDITOR_UPDATE.md | [동아리 편집 기록](../02-features/history/CLUB_EDITOR_UPDATE.md) | 편집 폼과 저장 |
| CLUB_PORTAL_UPDATE.md | [동아리 포털 기록](../02-features/history/CLUB_PORTAL_UPDATE.md) | 내 동아리·첫 화면 공지·인수인계 |
| CLUB_PROFILE_UPDATE.md | [프로필 기록](../02-features/history/CLUB_PROFILE_UPDATE.md) | 동아리 유형·분과·임원 정보 |
| PHOTO_SESSION_UPDATE.md | [사진·세션 기록](../02-features/history/PHOTO_SESSION_UPDATE.md) | 사진 제출 버튼·15분 미사용 전환 |
| RENTAL_ACCESS_UPDATE.md | [대여 입장 기록](../02-features/history/RENTAL_ACCESS_UPDATE.md) | 동시 로그인과 대여 조작 독점 |
| READ_ACCESS_UPDATE.md | [조회 권한 기록](../02-features/history/READ_ACCESS_UPDATE.md) | 조회 계정·기간제 링크·만료 기간 |
| SCHEDULED_OPENING_UPDATE.md | [자동 오픈 기록](../02-features/history/SCHEDULED_OPENING_UPDATE.md) | 서버 한국시간 기반 접수 개시 |
| READ_ACCESS_DESIGN.md | [조회 권한 설계](../03-architecture/READ_ACCESS_DESIGN.md) | 구현 전 설계·권한 경계; 현행은 기능 명세와 대조 |
| SECURITY_UPDATE.md | [보안 전환 기록](../03-architecture/history/SECURITY_UPDATE.md) | MFA·암호화·기존 데이터 전환 |
| DATA_MANAGEMENT_UPDATE.md | [자료 관리 기록](../05-database/history/DATA_MANAGEMENT_UPDATE.md) | 보관·정리·학기 초기화·백업 |
| PORTAL_LAYOUT_UPDATE.md | [포털 UI 기록](../06-uiux/history/PORTAL_LAYOUT_UPDATE.md) | 메뉴·화면 배치·반응형 |
| SITE_SETTINGS_UPDATE.md | [사이트 설정 기록](../06-uiux/history/SITE_SETTINGS_UPDATE.md) | 표시 문구·이미지·미리보기 |
| REVIEW.md | [검사 기록](../07-todo-list/review-history/REVIEW.md) | 버전별 검사 결과와 남은 한계 |

원문의 변경 시점·배포 경고·과거 검사 결과는 삭제하거나 최신 정책으로 덮어쓰지 않습니다. 이전 과정에서 문서명 참조만 새 위치의 상대 링크로 바꾸었습니다. 10분 미사용이나 비밀번호 원문 조회 등 오래된 설명은 당시 이력이며, [현행 계정 정책](../02-features/accounts-and-permissions.md)과 [보안 구조](../03-architecture/authentication-and-security.md)를 우선합니다.

## 운영 도구 호환성

[업데이트 구현](../../scripts/apply-account-update.mjs)은 루트 README·고지문·배치 진입점과 소스 디렉터리, `docs/` 전체를 복사합니다. 새 중첩 폴더도 같은 경로로 반영하고, 기존 대상 문서가 있으면 이전 내용을 `backups/site-update-*/`에 보관합니다. 운영 폴더에 남아 있는 과거 루트 문서를 자동 삭제하지 않습니다. 소스 저장소의 실제 이동과 운영 폴더의 비파괴 업데이트는 별개입니다.

[업데이트 검사](../../tests/update.test.mjs)는 모든 중첩 문서 복사·기존 문서 백업·운영자 이전 메모 보존·설정/키 보존을 확인합니다. `APPLY_*.cmd`, `BACKUP_DATA.cmd`, `RESTORE_BACKUP.cmd`와 [고지문](../../THIRD_PARTY_NOTICES.txt)은 루트 경로를 유지합니다.

## 새 문서 추가·이동 방법

1. 7개 분야 중 기준 분야 하나를 정합니다. 현행 설명은 분야 루트, 과거 배포 설명은 `history/`, 검사 결과는 `07-todo-list/review-history/`에 둡니다.
2. 해당 분야 README에서 새 문서로 직접 링크하고 필요한 관련 문서에 상대 링크를 추가합니다. 상세 설명을 여러 곳에 복제하지 않습니다.
3. 원문을 이동할 때 `git mv`를 사용하고 문서와 스크립트의 참조를 검색합니다. 새 루트 Markdown을 임의로 만들지 않습니다.
4. 파일 구조·DB·권한·숫자 제한을 실제 소스와 대조합니다. 운영에서 확인하지 않은 내용은 확인했다고 쓰지 않습니다.
5. `node --test tests/documentation.test.mjs`로 구조·로컬 링크·목차 도달성을 검사합니다. 업데이트 경로를 바꾸면 빌드 후 업데이트 검사와 전체 검사를 실행합니다.
6. [파일 트리](directory-tree.md)가 바뀌면 반영하고 PR에 문서 이전 목록·검증 명령·실행 결과를 기록합니다.

외부 문서의 실시간 가용성은 로컬 링크 검사로 확인하지 않습니다. 외부 서비스의 현재 요금·제한·보안 권고를 새로 단정하려면 공식 출처를 별도로 확인해야 합니다.

[파일 구조 목차](README.md)
