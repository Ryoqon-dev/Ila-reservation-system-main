# 스키마와 관계

이 문서는 [마이그레이션 0001~0012](../../migrations/)를 순서대로 빈 SQLite에 적용한 최종 스키마를 정리합니다. 업무 테이블 38개, 뷰 1개, 명시적 이름의 인덱스 25개, 트리거 13개가 있습니다. Wrangler가 관리하는 적용 이력 같은 플랫폼 내부 테이블은 이 목록에 포함하지 않습니다. 실제 운영 DB에 모두 적용되었는지는 별도 확인해야 합니다.

## 읽는 방법

열 표의 NOT NULL은 SQL 선언/PRAGMA 기준입니다. PK는 기본키 순번이고 복합키는 1·2로 표시합니다. SQLite에서 INTEGER PRIMARY KEY 이외의 일부 PK 선언은 명시적 NOT NULL과 같지 않으므로 PK라는 이유로 모든 열의 NOT NULL 표시를 보충하지 않았습니다. 기본값의 —는 DEFAULT 선언이 없다는 뜻입니다. 테이블별 UNIQUE와 FK는 별도로 표시합니다. 자동 생성 sqlite_autoindex 이름은 구현 상세이므로 해당 UNIQUE 열 조합으로 정리했습니다.

날짜는 주로 YYYY-MM-DD TEXT, 생성·수정 시각은 ISO TEXT, 세션/예약 오픈 만료는 epoch 밀리초 INTEGER입니다. JSON은 TEXT, 이미지는 BLOB입니다. 앱의 상태값/범위 검증과 SQL CHECK를 구분해야 합니다. 열 이름만으로 개인정보가 평문이라고 판단하지 마세요. 현재 대상 필드는 enc:v1: 접두어 암호문으로 보관합니다.

## 핵심 관계

`clubs` → 예약·벌점·계정·연락처·프로필·방 배정이 연결됩니다. 계정 → 다중 세션 → 대여 임대, 예약 → 확인코드, 벌점 → 마감 연결이 이어집니다. 조회 계정과 공유 링크는 별도 세션을 소유합니다. 물리 FK는 아래 테이블별 표기가 기준입니다. `penalty_closures.reset_id → data_jobs.id`, `data_jobs.owner → sessions.token`, `club_room_assignments.space_id → 코드의 공간 정의`는 논리 연결이며 SQL FK가 아닙니다.

## admin_challenges

비밀번호 로그인 이후 5분 MFA 도전. password_hash는 발급 당시 관리자 해시 사본, secret은 첫 등록 중 비밀 암호문이며 기존 MFA 로그인에서는 빈 값입니다.

정의: [0010_security_hardening.sql](../../migrations/0010_security_hardening.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `token` | TEXT | 아니오 | — | 1 |
| `password_hash` | TEXT | 예 | — | — |
| `secret` | TEXT | 예 | `''` | — |
| `expires` | INTEGER | 예 | — | — |
| `attempts` | INTEGER | 예 | `0` | — |

## admin_factor_changes

인증앱 교체 도중 소유 세션·새 비밀 암호문·5분 만료·기존 보안 버전을 묶습니다.

정의: [0010_security_hardening.sql](../../migrations/0010_security_hardening.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 아니오 | — | 1 |
| `owner` | TEXT | 예 | — | — |
| `secret` | TEXT | 예 | — | — |
| `expires` | INTEGER | 예 | — | — |
| `revision` | TEXT | 예 | — | — |

외래키: `owner → sessions.token` (DELETE CASCADE, UPDATE NO ACTION).

## admin_recovery_codes

일회용 복구 코드 HMAC. 원문을 보관하지 않고 사용하면 삭제합니다.

정의: [0010_security_hardening.sql](../../migrations/0010_security_hardening.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `code_hash` | TEXT | 아니오 | — | 1 |
| `created_at` | TEXT | 예 | — | — |

## admin_security

관리자 TOTP 비밀 암호문, 마지막 사용 단계, 재인증/변경 경합용 revision.

정의: [0010_security_hardening.sql](../../migrations/0010_security_hardening.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `id` | INTEGER | 아니오 | — | 1 |
| `secret` | TEXT | 예 | — | — |
| `last_step` | INTEGER | 예 | `-1` | — |
| `revision` | TEXT | 예 | — | — |

CHECK: id=1.

## admin_security_log

민감 작업 재인증 감사. 일반 업무 버전과 분리하고 최근 1,000행으로 제한합니다.

정의: [0010_security_hardening.sql](../../migrations/0010_security_hardening.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 아니오 | — | 1 |
| `action` | TEXT | 예 | — | — |
| `created_at` | TEXT | 예 | — | — |

## admin_session_security

관리자 세션의 MFA 확인과 마지막 명시적 활동. verified는 1만 허용합니다.

정의: [0010_security_hardening.sql](../../migrations/0010_security_hardening.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `token` | TEXT | 아니오 | — | 1 |
| `last_activity` | INTEGER | 예 | — | — |
| `verified` | INTEGER | 예 | — | — |

CHECK: verified=1.

외래키: `token → sessions.token` (DELETE CASCADE, UPDATE NO ACTION).

## admins

관리자 단일 계정. 앱은 id=1을 사용하지만 이 테이블 자체에는 id=1 CHECK가 없습니다. password_hash는 현재 v2 pepper 해시입니다.

정의: [0001_initial.sql](../../migrations/0001_initial.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `id` | INTEGER | 예 | — | 1 |
| `username` | TEXT | 예 | — | — |
| `password_hash` | TEXT | 예 | — | — |
| `salt` | TEXT | 예 | — | — |

## attempts

15분 창의 요청 제한 카운터. key는 종류와 IP/계정 식별자의 해시 조합이며 원본 IP를 이 열에 쓰지 않습니다.

정의: [0001_initial.sql](../../migrations/0001_initial.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `key` | TEXT | 예 | — | 1 |
| `count` | INTEGER | 예 | — | — |
| `reset_at` | INTEGER | 예 | — | — |

## audit

업무 감사. 업무 쓰기와 같은 배치에 추가되며 트리거가 자료 버전을 증가시킵니다. target은 작업별 일반 문자열/JSON이며 임의 비밀을 기록하지 않습니다.

정의: [0001_initial.sql](../../migrations/0001_initial.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 예 | — | 1 |
| `action` | TEXT | 예 | — | — |
| `target` | TEXT | 예 | — | — |
| `created_at` | TEXT | 예 | — | — |

## booking_access

예약 확인코드 SHA-256 보관. 예약 하나당 코드 해시 하나이며 원문 확인코드는 BOOKING_KEY와 request_key의 HMAC으로 재현합니다. FK에는 ON DELETE CASCADE가 없으므로 정리 시 이 행을 먼저 지웁니다.

정의: [0002_booking_access.sql](../../migrations/0002_booking_access.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `booking_id` | TEXT | 아니오 | — | 1 |
| `code_hash` | TEXT | 예 | — | — |

UNIQUE: `code_hash`.

외래키: `booking_id → bookings.id` (DELETE NO ACTION, UPDATE NO ACTION).

## bookings

예약 원본. start/end는 하루의 분 단위 정수입니다. 활성 상태는 APPROVED/OVERRIDE, 사용자 취소는 CANCELLED, 목록 숨김은 DELETED입니다. 상태·시간·중복/이용 제한은 주로 서비스 SQL과 입력 검증으로 보장하며 상태 CHECK나 시간 중복 UNIQUE는 없습니다. representative/phone/note/reason은 비어 있지 않으면 enc:v1: 암호문입니다. entry_photo/exit_photo는 사진 원본이 아닌 제출 확인값입니다.

정의: [0001_initial.sql](../../migrations/0001_initial.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 예 | — | 1 |
| `request_key` | TEXT | 예 | — | — |
| `date` | TEXT | 예 | — | — |
| `room` | TEXT | 예 | — | — |
| `start` | INTEGER | 예 | — | — |
| `end` | INTEGER | 예 | — | — |
| `club_id` | TEXT | 예 | — | — |
| `representative` | TEXT | 예 | — | — |
| `phone` | TEXT | 예 | — | — |
| `note` | TEXT | 예 | — | — |
| `status` | TEXT | 예 | — | — |
| `override` | INTEGER | 예 | — | — |
| `reason` | TEXT | 예 | — | — |
| `inspection` | INTEGER | 예 | — | — |
| `entry_photo` | INTEGER | 예 | `0` | — |
| `exit_photo` | INTEGER | 예 | `0` | — |
| `created_at` | TEXT | 예 | — | — |

외래키: `club_id → clubs.id` (DELETE NO ACTION, UPDATE NO ACTION).

## club_accounts

동아리별 단일 웹 계정. username_key는 소문자 로그인 키, password_hash/salt는 검증용입니다. password_cipher는 0010 이후 빈 문자열만 허용합니다. session_token/session_expires는 구형 호환 열이며 현재 로그인 기준은 club_sessions입니다. version 변경은 세션을 취소합니다.

정의: [0003_club_accounts.sql](../../migrations/0003_club_accounts.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 예 | — | 1 |
| `club_id` | TEXT | 예 | — | — |
| `username` | TEXT | 예 | — | — |
| `username_key` | TEXT | 예 | — | — |
| `password_hash` | TEXT | 예 | — | — |
| `salt` | TEXT | 예 | — | — |
| `password_cipher` | TEXT | 예 | — | — |
| `status` | TEXT | 예 | `'PENDING'` | — |
| `session_token` | TEXT | 아니오 | — | — |
| `session_expires` | INTEGER | 예 | `0` | — |
| `version` | INTEGER | 예 | `1` | — |
| `created_at` | TEXT | 예 | — | — |
| `updated_at` | TEXT | 예 | — | — |
| `approved_at` | TEXT | 아니오 | — | — |

UNIQUE: `session_token`; `username_key`; `club_id`.

CHECK: status IN ('PENDING','APPROVED','SUSPENDED').

외래키: `club_id → clubs.id` (DELETE NO ACTION, UPDATE NO ACTION).

## club_contacts

회장·부회장·총무의 이름·전화번호·학번 JSON 전체를 PII_KEY로 봉인한 문자열입니다.

정의: [0008_catalog_rooms_contacts.sql](../../migrations/0008_catalog_rooms_contacts.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `club_id` | TEXT | 예 | — | 1 |
| `contacts` | TEXT | 예 | — | — |

외래키: `club_id → clubs.id` (DELETE CASCADE, UPDATE NO ACTION).

## club_profiles

계정 승인과 별개인 유형·분과·회원수·지도교수. advisor는 개인정보 암호문입니다. version은 동시 수정 검사에 사용합니다.

정의: [0009_club_profiles.sql](../../migrations/0009_club_profiles.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `club_id` | TEXT | 예 | — | 1 |
| `type` | TEXT | 예 | `''` | — |
| `type_date` | TEXT | 예 | `''` | — |
| `division` | TEXT | 예 | `''` | — |
| `member_count` | INTEGER | 아니오 | — | — |
| `advisor` | TEXT | 예 | `''` | — |
| `version` | TEXT | 예 | — | — |
| `updated_at` | TEXT | 예 | — | — |

CHECK: type IN ('','REGULAR','ASSOCIATE','NEW'); division IN ('','PERFORMANCE','VOLUNTEER','SPORTS','CULTURE_ACADEMIC'); member_count IS NULL 또는 typeof(member_count)='integer' AND 0~100000; type=''이면 type_date='', 아니면 길이 10의 YYYY-MM-DD 숫자 패턴. 실제 유효 날짜는 앱이 추가 검사.

외래키: `club_id → clubs.id` (DELETE CASCADE, UPDATE NO ACTION).

## club_rental_leases

계정별 단일 장소대여 임대. token은 해당 로그인 세션을 참조합니다. 소유자 heartbeat로 3분 갱신하며 로그인이 곧 대여 소유권은 아닙니다. token이 같은 account_id의 세션인지 업무 SQL에서 검사합니다.

정의: [0007_concurrent_club_sessions.sql](../../migrations/0007_concurrent_club_sessions.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `account_id` | TEXT | 예 | — | 1 |
| `token` | TEXT | 예 | — | — |
| `expires` | INTEGER | 예 | — | — |

외래키: `token → club_sessions.token` (DELETE CASCADE, UPDATE NO ACTION); `account_id → club_accounts.id` (DELETE CASCADE, UPDATE NO ACTION).

## club_room_assignments

동아리별 배정 공간 하나. space_id는 floorplan-defaults/room_layout의 코드상 공간 ID이며 별도 SQL 공간 테이블을 참조하는 FK가 아닙니다. 여러 동아리가 같은 공간을 사용할 수 있습니다.

정의: [0008_catalog_rooms_contacts.sql](../../migrations/0008_catalog_rooms_contacts.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `club_id` | TEXT | 예 | — | 1 |
| `space_id` | TEXT | 예 | — | — |

외래키: `club_id → clubs.id` (DELETE CASCADE, UPDATE NO ACTION).

## club_sessions

기기별 동아리 로그인. token은 원문 쿠키의 SHA-256, version은 계정 버전 사본입니다. expires/created_at/last_seen은 epoch 밀리초입니다.

정의: [0007_concurrent_club_sessions.sql](../../migrations/0007_concurrent_club_sessions.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `token` | TEXT | 예 | — | 1 |
| `account_id` | TEXT | 예 | — | — |
| `version` | INTEGER | 예 | — | — |
| `expires` | INTEGER | 예 | — | — |
| `created_at` | INTEGER | 예 | — | — |
| `last_seen` | INTEGER | 예 | — | — |

외래키: `account_id → club_accounts.id` (DELETE CASCADE, UPDATE NO ACTION).

## clubs

동아리 마스터. name_key는 정규화 이름, password는 ROOM_KEY로 암호화한 동아리방 비밀번호이며 웹 계정 해시와 다릅니다. 이름 변경에도 id는 유지합니다.

정의: [0001_initial.sql](../../migrations/0001_initial.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 예 | — | 1 |
| `name` | TEXT | 예 | — | — |
| `name_key` | TEXT | 예 | — | — |
| `room` | TEXT | 예 | — | — |
| `password` | TEXT | 예 | — | — |
| `active` | INTEGER | 예 | `1` | — |
| `updated_at` | TEXT | 예 | — | — |

## content_entries

guide/equipment/board 콘텐츠와 선택적 이미지 BLOB. visible=0은 관리자에게만 노출합니다. version/payload_hash는 저장 경합과 같은 요청의 내용 일치를 검사합니다. MIME·이미지 서명·용량은 애플리케이션에서 추가 검증합니다.

정의: [0008_catalog_rooms_contacts.sql](../../migrations/0008_catalog_rooms_contacts.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 예 | — | 1 |
| `section` | TEXT | 예 | — | — |
| `title` | TEXT | 예 | — | — |
| `body` | TEXT | 예 | — | — |
| `position` | INTEGER | 예 | — | — |
| `visible` | INTEGER | 예 | `1` | — |
| `version` | TEXT | 예 | — | — |
| `payload_hash` | TEXT | 예 | — | — |
| `image_revision` | TEXT | 아니오 | — | — |
| `mime` | TEXT | 아니오 | — | — |
| `data` | BLOB | 아니오 | — | — |
| `updated_at` | TEXT | 예 | — | — |

CHECK: section IN ('guide','equipment','board'); visible IN (0,1).

## data_jobs

미리보기·CSV 진행·학기 마감·정리 실행의 상태. owner는 관리자 세션 해시지만 SQL FK가 아닙니다. params/export_cursor는 JSON 문자열, revision/step은 스냅샷과 중복 실행을 검사합니다. state의 ready/executing/complete는 코드 정책이며 DB CHECK는 없습니다. authorized_until/expires는 epoch 밀리초, completed_at은 ISO 문자열입니다.

정의: [0006_data_management.sql](../../migrations/0006_data_management.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 아니오 | — | 1 |
| `owner` | TEXT | 예 | — | — |
| `action` | TEXT | 예 | — | — |
| `params` | TEXT | 예 | — | — |
| `label` | TEXT | 예 | — | — |
| `target_name` | TEXT | 예 | — | — |
| `total` | INTEGER | 예 | — | — |
| `points` | INTEGER | 예 | — | — |
| `processed` | INTEGER | 예 | `0` | — |
| `step` | INTEGER | 예 | `0` | — |
| `revision` | INTEGER | 예 | — | — |
| `state` | TEXT | 예 | `'ready'` | — |
| `export_position` | INTEGER | 예 | `0` | — |
| `export_cursor` | TEXT | 아니오 | — | — |
| `export_ready` | INTEGER | 예 | `0` | — |
| `authorized_until` | INTEGER | 예 | `0` | — |
| `created_at` | TEXT | 예 | — | — |
| `expires` | INTEGER | 예 | — | — |
| `completed_at` | TEXT | 아니오 | — | — |

CHECK: action IN ('reset','cleanup').

## data_metrics

선택적 계정 통계 연결. token_cipher는 ROOM_KEY 파생 키 암호문, cache는 JSON 집계, refreshed_at은 마지막 집계 시각입니다.

정의: [0006_data_management.sql](../../migrations/0006_data_management.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `id` | INTEGER | 아니오 | — | 1 |
| `account_id` | TEXT | 예 | — | — |
| `token_cipher` | TEXT | 예 | — | — |
| `cache` | TEXT | 아니오 | — | — |
| `refreshed_at` | TEXT | 아니오 | — | — |

CHECK: id=1.

## data_revision

업무 감사 INSERT로 증가하는 단일 자료 버전. 직접 SQL 변경이 이 버전을 자동 갱신하는 것은 아닙니다.

정의: [0006_data_management.sql](../../migrations/0006_data_management.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `id` | INTEGER | 아니오 | — | 1 |
| `version` | INTEGER | 예 | — | — |

CHECK: id=1.

## day_events

날짜별 holiday/inspection 일정. kind 허용값은 애플리케이션에서 검사하며 SQL CHECK는 없습니다.

정의: [0001_initial.sql](../../migrations/0001_initial.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `date` | TEXT | 예 | — | 1 |
| `kind` | TEXT | 예 | — | 2 |
| `name` | TEXT | 예 | — | — |

## opening_schedule_batches

시각 예약 오픈 배치. opens_at은 epoch 밀리초, targets_json은 발급 당시 대상 JSON, status는 ACTIVE/CANCELLED입니다.

정의: [0011_scheduled_openings.sql](../../migrations/0011_scheduled_openings.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 예 | — | 1 |
| `opens_at` | INTEGER | 예 | — | — |
| `targets_json` | TEXT | 예 | — | — |
| `status` | TEXT | 예 | `'ACTIVE'` | — |
| `created_at` | TEXT | 예 | — | — |
| `updated_at` | TEXT | 예 | — | — |

CHECK: status IN ('ACTIVE','CANCELLED').

## opening_schedule_targets

현재 날짜·장소를 연결하는 예약 오픈 대상. 같은 날짜·장소는 하나의 배치만 참조합니다. 배치 삭제 시 CASCADE입니다.

정의: [0011_scheduled_openings.sql](../../migrations/0011_scheduled_openings.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `date` | TEXT | 예 | — | 1 |
| `room` | TEXT | 예 | — | 2 |
| `batch_id` | TEXT | 예 | — | — |

CHECK: room IN ('심정실','진리실','창의실').

외래키: `batch_id → opening_schedule_batches.id` (DELETE CASCADE, UPDATE NO ACTION).

## openings

날짜·장소별 수동 오픈 상태. 예약 오픈 배치와 결합한 실제 유효 오픈은 opening-time.mjs에서 계산합니다.

정의: [0001_initial.sql](../../migrations/0001_initial.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `date` | TEXT | 예 | — | 1 |
| `room` | TEXT | 예 | — | 2 |
| `is_open` | INTEGER | 예 | — | — |

## penalties

벌점 원본. content는 개인정보 암호문. source_key 고유성은 사진 벌점의 중복 방지에 사용하며 NULL인 수동 점검 벌점은 여러 건 가능합니다. voided=1은 취소값이고 마감은 별도 연결 테이블입니다.

정의: [0001_initial.sql](../../migrations/0001_initial.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 예 | — | 1 |
| `club_id` | TEXT | 예 | — | — |
| `date` | TEXT | 예 | — | — |
| `content` | TEXT | 예 | — | — |
| `points` | INTEGER | 예 | — | — |
| `kind` | TEXT | 예 | — | — |
| `source_key` | TEXT | 아니오 | — | — |
| `voided` | INTEGER | 예 | `0` | — |
| `created_at` | TEXT | 예 | — | — |

외래키: `club_id → clubs.id` (DELETE NO ACTION, UPDATE NO ACTION).

## penalty_closures

벌점별 학기 마감 연결. reset_id는 data_jobs.id의 논리 관계이며 SQL FK가 아닙니다. 벌점 삭제는 이 연결을 CASCADE로 제거합니다.

정의: [0006_data_management.sql](../../migrations/0006_data_management.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `penalty_id` | TEXT | 아니오 | — | 1 |
| `reset_id` | TEXT | 예 | — | — |

외래키: `penalty_id → penalties.id` (DELETE CASCADE, UPDATE NO ACTION).

## penalty_periods

동아리별 새 벌점 기간 하한. 마감일 이전 벌점을 다시 부과하지 않도록 업무 검증에 사용합니다.

정의: [0006_data_management.sql](../../migrations/0006_data_management.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `club_id` | TEXT | 아니오 | — | 1 |
| `start_date` | TEXT | 예 | — | — |

외래키: `club_id → clubs.id` (DELETE NO ACTION, UPDATE NO ACTION).

## privacy_state

개인정보 변환 완료 게이트. 초기 ready=0, 변환 검증 완료 후 1이며 이때 평문 차단 트리거도 활성화됩니다.

정의: [0010_security_hardening.sql](../../migrations/0010_security_hardening.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `id` | INTEGER | 아니오 | — | 1 |
| `ready` | INTEGER | 예 | `0` | — |

CHECK: id=1; ready IN (0,1).

## reservation_reader_sessions

조회 전용 로그인. token은 쿠키 해시, version은 계정 버전 사본, expires/last_activity는 epoch 밀리초입니다.

정의: [0012_reservation_read_access.sql](../../migrations/0012_reservation_read_access.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `token` | TEXT | 예 | — | 1 |
| `reader_id` | TEXT | 예 | — | — |
| `version` | INTEGER | 예 | — | — |
| `expires` | INTEGER | 예 | — | — |
| `last_activity` | INTEGER | 예 | — | — |

외래키: `reader_id → reservation_readers.id` (DELETE CASCADE, UPDATE NO ACTION).

## reservation_readers

조회 전용 계정. active와 version으로 즉시 권한 회수를 검사하고 관리자/동아리 인증과 분리합니다.

정의: [0012_reservation_read_access.sql](../../migrations/0012_reservation_read_access.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 예 | — | 1 |
| `username` | TEXT | 예 | — | — |
| `name` | TEXT | 예 | — | — |
| `salt` | TEXT | 예 | — | — |
| `password_hash` | TEXT | 예 | — | — |
| `active` | INTEGER | 예 | `1` | — |
| `version` | INTEGER | 예 | `1` | — |
| `created_at` | TEXT | 예 | — | — |
| `updated_at` | TEXT | 예 | — | — |

UNIQUE: `username`.

CHECK: active IN (0,1).

## reservation_share_links

범위 제한 조회 링크. token_hash는 링크 원문 해시, rooms_json은 허용 장소 목록, date_from/date_to는 조회 범위입니다. revoked와 expires는 매 요청 검사합니다.

정의: [0012_reservation_read_access.sql](../../migrations/0012_reservation_read_access.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `id` | TEXT | 예 | — | 1 |
| `token_hash` | TEXT | 예 | — | — |
| `name` | TEXT | 예 | — | — |
| `date_from` | TEXT | 예 | — | — |
| `date_to` | TEXT | 예 | — | — |
| `rooms_json` | TEXT | 예 | — | — |
| `expires` | INTEGER | 예 | — | — |
| `revoked` | INTEGER | 예 | `0` | — |
| `created_at` | TEXT | 예 | — | — |

UNIQUE: `token_hash`.

CHECK: revoked IN (0,1).

## reservation_share_sessions

링크를 교환한 접속 세션. 원문 쿠키의 해시이며 링크 만료/정지와 세션 만료를 함께 검사합니다.

정의: [0012_reservation_read_access.sql](../../migrations/0012_reservation_read_access.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `token` | TEXT | 예 | — | 1 |
| `link_id` | TEXT | 예 | — | — |
| `expires` | INTEGER | 예 | — | — |

외래키: `link_id → reservation_share_links.id` (DELETE CASCADE, UPDATE NO ACTION).

## room_layout

평면도 기본 데이터에 적용할 overrides JSON. 공간 자체의 기준 데이터는 lib/floorplan-defaults.mjs입니다.

정의: [0008_catalog_rooms_contacts.sql](../../migrations/0008_catalog_rooms_contacts.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `id` | INTEGER | 아니오 | — | 1 |
| `version` | TEXT | 예 | — | — |
| `overrides` | TEXT | 예 | — | — |
| `updated_at` | TEXT | 예 | — | — |

CHECK: id=1.

## sessions

관리자 세션의 토큰 해시와 절대 만료. 이 행만으로 MFA 완료 권한이 생기지 않으며 admin_session_security를 함께 검사합니다.

정의: [0001_initial.sql](../../migrations/0001_initial.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `token` | TEXT | 예 | — | 1 |
| `expires` | INTEGER | 예 | — | — |

## site_content

사이트 설정 JSON과 이미지 버전 JSON. version/payload_hash는 저장 버전·요청 내용 일치 검사에 사용합니다.

정의: [0004_site_content.sql](../../migrations/0004_site_content.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `id` | INTEGER | 예 | — | 1 |
| `version` | TEXT | 예 | — | — |
| `payload_hash` | TEXT | 예 | — | — |
| `settings` | TEXT | 예 | — | — |
| `image_versions` | TEXT | 예 | — | — |
| `updated_at` | TEXT | 예 | — | — |

CHECK: id=1.

## site_images

logo/wordmark/campus 슬롯의 브랜딩 이미지 BLOB. revision은 이미지 내용 기반 버전입니다.

정의: [0004_site_content.sql](../../migrations/0004_site_content.sql).

| 열 | 형식 | NOT NULL | 기본값 | PK 순번 |
| --- | --- | --- | --- | --- |
| `slot` | TEXT | 예 | — | 1 |
| `revision` | TEXT | 예 | — | — |
| `mime` | TEXT | 예 | — | — |
| `data` | BLOB | 예 | — | — |

CHECK: slot IN ('logo','wordmark','campus'); mime IN ('image/png','image/jpeg','image/webp').

## 명시적 인덱스

아래 인덱스 외 PK·UNIQUE의 자동 인덱스가 있습니다. `bookings_phone`은 초기 스키마의 인덱스이며 현재 전화번호는 무작위 IV로 암호화되므로 평문 전화번호 검색용으로 해석하지 않습니다.

| 인덱스 | 정의 |
| --- | --- |
| `admins_username_unique` | `CREATE UNIQUE INDEX admins_username_unique ON admins (username)` |
| `audit_export_date` | `CREATE INDEX audit_export_date ON audit(substr(created_at,1,10),id)` |
| `bookings_club_day` | `CREATE INDEX bookings_club_day ON bookings (club_id,date,status)` |
| `bookings_day_room` | `CREATE INDEX bookings_day_room ON bookings (date,room,status)` |
| `bookings_export_date` | `CREATE INDEX bookings_export_date ON bookings(date,start,id)` |
| `bookings_phone` | `CREATE INDEX bookings_phone ON bookings (phone)` |
| `bookings_request_key_unique` | `CREATE UNIQUE INDEX bookings_request_key_unique ON bookings (request_key)` |
| `club_profiles_type_division` | `CREATE INDEX club_profiles_type_division ON club_profiles(type,division)` |
| `club_room_space` | `CREATE INDEX club_room_space ON club_room_assignments(space_id)` |
| `club_sessions_account` | `CREATE INDEX club_sessions_account ON club_sessions(account_id,created_at,token)` |
| `club_sessions_expiry` | `CREATE INDEX club_sessions_expiry ON club_sessions(expires)` |
| `clubs_name_key_unique` | `CREATE UNIQUE INDEX clubs_name_key_unique ON clubs (name_key)` |
| `content_entries_section` | `CREATE INDEX content_entries_section ON content_entries(section,position,id)` |
| `data_jobs_time` | `CREATE INDEX data_jobs_time ON data_jobs(created_at,id)` |
| `opening_schedule_batch_targets` | `CREATE INDEX opening_schedule_batch_targets ON opening_schedule_targets(batch_id,date,room)` |
| `opening_schedule_time` | `CREATE INDEX opening_schedule_time ON opening_schedule_batches(status,opens_at,id)` |
| `penalties_club_date` | `CREATE INDEX penalties_club_date ON penalties (club_id,date)` |
| `penalties_club_history` | `CREATE INDEX penalties_club_history ON penalties(club_id,voided,date DESC,created_at DESC)` |
| `penalties_current` | `CREATE INDEX penalties_current ON penalties(voided,club_id,date)` |
| `penalties_export_date` | `CREATE INDEX penalties_export_date ON penalties(date,id)` |
| `penalty_source_unique` | `CREATE UNIQUE INDEX penalty_source_unique ON penalties (source_key)` |
| `reservation_reader_session_expiry` | `CREATE INDEX reservation_reader_session_expiry ON reservation_reader_sessions(expires)` |
| `reservation_reader_session_owner` | `CREATE INDEX reservation_reader_session_owner ON reservation_reader_sessions(reader_id,version)` |
| `reservation_share_link_expiry` | `CREATE INDEX reservation_share_link_expiry ON reservation_share_links(revoked,expires)` |
| `reservation_share_session_link` | `CREATE INDEX reservation_share_session_link ON reservation_share_sessions(link_id,expires)` |

## 뷰와 트리거

[0006](../../migrations/0006_data_management.sql)의 `penalty_records`는 `penalties.*`에 연결된 `penalty_closures.reset_id`를 붙인 뷰입니다. 원본 값을 덮어쓰지 않고 현재/마감 벌점을 구분합니다.

| 트리거 | 조건과 효과 |
| --- | --- |
| audit_data_revision | audit INSERT 후 data_revision.version 증가. 업무 변경은 같은 배치의 감사 삽입을 통해 버전 추적 |
| club_sessions_revoke | club_accounts.version 변경 시 해당 계정의 모든 club_sessions 삭제; 임대는 연쇄 삭제 |
| club_password_hash_only_insert / club_password_hash_only_update | password_cipher에 빈 문자열 이외 값을 쓰면 PASSWORD_HASH_ONLY로 중단 |
| admin_security_log_bound | 보안 로그 INSERT 후 created_at DESC, id DESC의 최근 1,000건만 유지 |
| privacy_club_contacts_insert / privacy_club_contacts_update | ready=1일 때 contacts의 비어 있지 않은 평문 거절 |
| privacy_club_profiles_insert / privacy_club_profiles_update | ready=1일 때 advisor의 비어 있지 않은 평문 거절 |
| privacy_bookings_insert / privacy_bookings_update | ready=1일 때 representative·phone·note·reason의 비어 있지 않은 평문 거절 |
| privacy_penalties_insert / privacy_penalties_update | ready=1일 때 content의 비어 있지 않은 평문 거절 |

평문 차단은 문자열 접두어 검사이며 암호문 자체의 무결성은 AES-GCM 복호화에서 확인합니다. 트리거 SQL은 [0007](../../migrations/0007_concurrent_club_sessions.sql), [0010](../../migrations/0010_security_hardening.sql)에 있습니다.

## 운영상 주의

- 예약·벌점의 clubs FK는 NO ACTION입니다. 동아리는 단순 삭제보다 active 변경으로 운영하며 이력이 존재하는 동아리 삭제를 가정하지 않습니다.
- booking_access FK는 CASCADE가 아니므로 영구 예약 정리는 확인코드 연결을 먼저 제거합니다.
- reset_id에 FK가 없다고 마감 이력의 data_jobs를 임의로 지우면 처리명 연결이 사라질 수 있습니다.
- JSON 구조·실제 달력 날짜·예약 겹침·계정 세션 버전 등 모든 규칙이 DDL에 있지는 않습니다. 원본 SQL 직접 변경은 서비스의 감사·자료 버전·암호화·권한 조건을 우회할 수 있습니다.
- 개인정보 전환 중에는 privacy_state를 수동으로 1로 올리지 않습니다. [마이그레이션](migrations.md)의 변환 검증을 완료해야 합니다.

관계 사용과 일관성은 [시스템 개요](../03-architecture/system-overview.md), 키·세션은 [인증과 보안](../03-architecture/authentication-and-security.md), 정리·백업은 [데이터 관리](data-management.md)를 참고하세요. 테스트의 전체 스키마 구성은 [account-helpers.mjs](../../tests/account-helpers.mjs), 마이그레이션별 보존 검사는 [마이그레이션 문서](migrations.md)에 연결했습니다.
