# 마이그레이션

## 누적 변경 목록

마이그레이션 디렉터리는 배포 설정의 `DB.migrations_dir`에 연결됩니다. 표는 파일 순서와 실제 SQL을 기준으로 합니다. 파일 전체가 모두 반복 실행 가능한 것은 아니므로 이미 적용한 SQL을 수동으로 다시 붙여넣지 않습니다.

| 번호·원문 | 변경 | 보존·전환 특징 |
| --- | --- | --- |
| [0001_initial.sql](../../migrations/0001_initial.sql) | 관리자·시도 제한·감사·예약·동아리·일정·오픈·벌점·관리자 세션과 기본 인덱스 | 초기 스키마; 예약과 벌점의 동아리 FK, 요청키·동아리명 정규키·벌점 소스 고유성 |
| [0002_booking_access.sql](../../migrations/0002_booking_access.sql) | `booking_access` | 기존 예약과 분리된 확인코드 해시; 예약 FK와 해시 UNIQUE |
| [0003_club_accounts.sql](../../migrations/0003_club_accounts.sql) | `club_accounts` | 동아리별 계정 하나, 상태·비밀번호·구형 세션 열; 기존 예약·동아리 변경 없음 |
| [0004_site_content.sql](../../migrations/0004_site_content.sql) | `site_content`, `site_images` | 설정과 브랜딩 이미지를 계정·예약과 분리 |
| [0005_club_portal.sql](../../migrations/0005_club_portal.sql) | `penalties_club_history` 인덱스 | 내 동아리 벌점 이력 조회 지원 |
| [0006_data_management.sql](../../migrations/0006_data_management.sql) | 벌점 마감 연결·기간·뷰, 내보내기 인덱스, 자료 버전·트리거, 작업·사용량 연결 | 기존 벌점 행을 지우거나 바꾸지 않고 마감 여부를 별도로 연결; 버전 0에서 시작 |
| [0007_concurrent_club_sessions.sql](../../migrations/0007_concurrent_club_sessions.sql) | 다중 로그인 세션·독점 대여 임대·버전 취소 트리거 | 살아 있는 구형 세션을 새 테이블로 이전; 승인 계정에 3분 임대; 계정 version 변경 시 세션 취소 |
| [0008_catalog_rooms_contacts.sql](../../migrations/0008_catalog_rooms_contacts.sql) | 게시물·연락처·평면도·방 배정 | 초기 `room_layout` 한 행; 여러 동아리가 같은 공간을 참조할 수 있음 |
| [0009_club_profiles.sql](../../migrations/0009_club_profiles.sql) | 동아리 유형·날짜·분과·인원·지도교수 | 계정 승인 상태와 독립적; 유형/날짜 일관성 CHECK |
| [0010_security_hardening.sql](../../migrations/0010_security_hardening.sql) | 관리자 MFA·세션 보안·도전·복구 코드·인증앱 교체·보안 로그·개인정보 게이트와 트리거 | 기존 관리자 sessions 삭제; 동아리 `password_cipher` 비우기 및 재저장 차단; 업무 개인정보는 후속 스크립트로 변환 |
| [0011_scheduled_openings.sql](../../migrations/0011_scheduled_openings.sql) | 오픈 예약 배치·날짜/장소별 대상 | 기존 예약·확인서·수동 오픈·계정·설정 미변경 |
| [0012_reservation_read_access.sql](../../migrations/0012_reservation_read_access.sql) | 조회 계정·세션·공유 링크·접속 세션 | 기존 인증 테이블·예약·동아리·벌점을 변경하지 않는 추가 테이블 |

최종 열·제약의 전체 목록은 [스키마와 관계](schema-and-relations.md)에 있습니다.

## 적용 경로

기존 운영 환경에는 [배포 도구](../03-architecture/deployment-and-operations.md)의 백업 선행 업데이트를 사용합니다. 내부적으로 실행하는 원격 명령은 다음과 같습니다.

```powershell
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --remote --config wrangler.json
```

이 명령은 원격 DB를 바꿉니다. 코드만 검토하거나 문서 링크를 확인하는 작업에서 실행하지 않습니다. 대상 `wrangler.json`의 Worker 이름·DB ID·기존 키를 확인하고 DB/키 백업을 보존해야 합니다. 이 문서 작성에서는 명령을 실행하지 않았습니다.

Wrangler의 마이그레이션 이력과 SQL 자체의 재실행 안전성은 별개입니다. `CREATE TABLE IF NOT EXISTS`가 많은 파일도 INSERT·트리거 등 다른 문장이 있을 수 있습니다. 특히 0006은 초기 한 행 INSERT와 일반 CREATE, 0010은 세션 삭제·비밀번호 암호문 제거를 포함합니다. 모든 파일이 멱등이라는 가정으로 직접 전체를 재실행하지 마세요.

## 0010은 스키마 적용만으로 끝나지 않음

SQL은 `privacy_state(id=1, ready=0)`을 만들고 과거 관리자 세션을 폐기합니다. `ready=0`에서는 로그인·최초 설정 등 제한된 경로 외 업무 API가 503을 반환합니다. [security-migration.mjs](../../scripts/security-migration.mjs)가 기존 개인정보를 읽어 `PII_KEY`로 암호화하고 잔여 평문 7개 열의 건수를 검사한 후 `ready=1`로 전환합니다.

대상은 `club_contacts.contacts`, `club_profiles.advisor`, `bookings.representative/phone/note/reason`, `penalties.content`입니다. 이미 `enc:v1:`인 값은 복호화 검증하고 다시 암호화하지 않습니다. 키 오류·손상·검증 실패 시 활성화하지 않습니다. `ensureSecurityKeys`는 기존 `ROOM_KEY`·`BOOKING_KEY`가 없거나 형식이 틀리면 거절하며 없는 `PII_KEY`·`MFA_KEY`만 추가합니다. 기존 키를 무작정 다시 만드는 절차가 아닙니다.

관리자 로그인은 기존 ID·비밀번호를 유지하되 MFA 등록이 필요합니다. 동아리의 원문 비밀번호 저장은 폐지되지만 비밀번호 해시는 유지됩니다. 이 변화 때문에 0010 이전 소스만 다시 배포하는 것을 완전한 롤백으로 취급할 수 없습니다. 이전 Worker는 평문을 쓰려다 개인정보 트리거에 거절될 수 있으며, 보안 기능을 제거한 복구는 데이터 상태까지 함께 검토해야 합니다.

## 로컬 스키마와 검증 근거

[account-helpers.mjs](../../tests/account-helpers.mjs)는 외래키를 켠 메모리 SQLite에 0001~0012를 순서대로 적용하고 테스트 전 `ready=1`로 설정합니다. 이 편의 fixture가 실제 운영 개인정보 전환을 대신하지 않습니다. 전환 자체는 [security-hardening.test.mjs](../../tests/security-hardening.test.mjs)의 실제 SQL 변환·재실행 검사에서 별도로 다룹니다.

| 테스트 | 확인하는 변화 |
| --- | --- |
| [data-management.test.mjs](../../tests/data-management.test.mjs) | 0006 전후 벌점 값 보존, 버전 카운터, 마감·정리 원자성 |
| [rental-sessions.test.mjs](../../tests/rental-sessions.test.mjs) | 0007 구형 로그인·예약·자격증명 보존과 반복 적용, 다중 세션·임대 |
| [club-profile.test.mjs](../../tests/club-profile.test.mjs) | 프로필 필드·제약·동시 버전 변경·기존 동아리 정보 보존 |
| [security-hardening.test.mjs](../../tests/security-hardening.test.mjs) | MFA 전환·평문 차단·키 오류·변환 후 재실행 |
| [scheduled-openings.test.mjs](../../tests/scheduled-openings.test.mjs) | 0011 추가 스키마와 기존 예약·수동 오픈 보존 |
| [reservation-read.test.mjs](../../tests/reservation-read.test.mjs) | 0012 적용 전후 기존 예약·계정·확인코드 보존 |
| [update.test.mjs](../../tests/update.test.mjs) | 백업 실패 시 변경 중단, 스키마 실패 시 배포 중단, 개인정보 검증 실패 시 미활성화 |
| [runtime-check.mjs](../../scripts/runtime-check.mjs) | 실제 로컬 Worker+D1에 전체 스키마를 적용한 주요 통합 경로 |

테스트에서 보존을 검사한 특정 파일과 전체 운영 복구 가능성을 구분하세요. 배포 실패 후 원격 데이터의 자동 역마이그레이션은 구현되어 있지 않습니다. [데이터 관리와 복구](data-management.md)의 암호화 백업을 기준으로 별도 복구를 준비합니다.
