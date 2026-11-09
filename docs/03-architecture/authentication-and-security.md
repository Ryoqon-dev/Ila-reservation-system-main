# 인증과 보안

## 신뢰 경계

관리자·동아리·조회 전용 계정·공유 링크는 서버가 발급한 서로 다른 쿠키와 DB 상태로 구분합니다. `role`, `verified`, 이메일 헤더 같은 브라우저 입력은 권한을 부여하지 않습니다. [worker.mjs](../../worker.mjs)는 `oai-authenticated-user-email`·`oai-authenticated-user-id`를 제거하고 API에 전달합니다.

`SITE_PUBLIC`이 문자열 `'true'`가 아니면 별도 Basic 인증이 모든 경로를 보호합니다. 사용자명은 `ila-owner`, 비밀번호는 `PRIVATE_PASSWORD`입니다. 이 게이트를 통과해도 관리자 권한이나 동아리 권한이 생기지 않습니다. 인증 실패는 401과 `WWW-Authenticate`, `Cache-Control: no-store`를 반환합니다. 공개/비공개 경계의 테스트는 [worker.test.mjs](../../tests/worker.test.mjs)에 있습니다.

API 진입에는 `DB`와 64자리 소문자 16진수 `ROOM_KEY`, `BOOKING_KEY`, `PII_KEY`, `MFA_KEY`가 필요합니다. 누락·형식 오류는 503입니다. 개인정보 변환 완료 전에도 업무 API가 503을 반환하므로 인증 실패와 보안 전환 중 상태를 구분해야 합니다.

## 인증 주체별 정책

| 주체 | 쿠키 | DB 검증·수명 |
| --- | --- | --- |
| 관리자 | `__Host-ila_admin` | `sessions`+`admin_session_security.verified=1`, 절대 8시간, 미사용 15분 |
| 동아리 | `__Host-ila_club` | `club_sessions`와 계정 버전·상태·활성 동아리, 절대 8시간 |
| 조회 전용 계정 | `__Host-ila_reader` | `reservation_reader_sessions`와 활성 계정·버전, 절대 8시간, 미사용 15분 |
| 공유 링크 접속 | `__Host-ila_share` | 접속 세션과 미정지·미만료 원본 링크, 링크 만료와 발급 후 7일 중 이른 시각 |

이 쿠키들은 `HttpOnly; Secure; SameSite=Strict; Path=/`를 사용합니다. 브라우저에는 무작위 32바이트 토큰을, DB에는 SHA-256 해시를 보관합니다. 세션 토큰 원문과 DB 해시를 혼용하지 마세요. 관리자 로그인 첫 단계의 도전 토큰도 같은 쿠키 이름을 사용하지만 검증된 세션이 아니므로 업무 권한은 없습니다.

출처·본문·속도 제한은 [API 흐름](api-and-data-flow.md)에 설명되어 있습니다. 각 쓰기 SQL은 세션의 유효성을 다시 조건으로 검사합니다. 로그아웃·정지·비밀번호 변경과 작업이 경합할 때 인증 전 확인만 통과한 요청이 저장되지 않도록 하는 경계입니다.

## 관리자 최초 설정과 MFA

1. `setup`은 64자리 최초 설정 키와 `BOOTSTRAP_TOKEN`을 비교하고 `admins.id=1`이 없을 때만 계정을 생성합니다. 이 단계는 로그인 세션을 발급하지 않습니다.
2. `login`은 ID·비밀번호를 확인하고 5분짜리 `admin_challenges`를 만듭니다. MFA가 아직 없으면 새 TOTP 비밀을 `MFA_KEY`로 암호화하여 도전에 저장하고 등록 정보·URI를 반환합니다.
3. `mfaVerify`가 유효한 도전과 TOTP 또는 복구 코드를 검증한 뒤 검증된 관리자 세션을 발급합니다. 도전당 잘못된 시도는 5회로 제한합니다. 첫 등록은 복구 코드 10개를 한 번 반환합니다.
4. 이후 읽기·쓰기에서도 절대 만료와 마지막 명시적 활동 시각을 검사합니다. `adminActivity`는 살아 있는 세션만 갱신하며 일반 조회나 자동 새로고침은 만료를 연장하지 않습니다.

TOTP는 30초 단계, 제한된 허용 시각 범위와 `last_step`을 사용하여 이미 사용한 코드를 거절합니다. 복구 코드의 DB 값은 `MFA_KEY`로 만든 HMAC이며 한 번 사용하면 삭제합니다. 동시 사용도 하나의 성공만 허용하도록 버전·조건부 배치로 묶습니다. 사용한 OTP로 바로 다음 민감 작업을 승인할 수 없으므로 다음 코드 또는 미사용 복구 코드가 필요합니다. 구현은 [admin-auth.mjs](../../lib/admin-auth.mjs), [totp.mjs](../../lib/totp.mjs), 정책 상수는 [admin-session-policy.mjs](../../lib/admin-session-policy.mjs)입니다.

민감 작업의 `requireProof`는 살아 있는 관리자 세션에 더해 현재 비밀번호와 새로운 TOTP/복구 코드를 요구합니다. 적용 대상은 관리자 자격증명 변경·인증앱 교체·복구 코드 재발급, 동아리 계정 비밀번호 설정/계정 삭제, 방 비밀번호 조회, 데이터 마감·삭제 승인, 사용량 조회 연결 변경, 조회 계정 저장·공유 링크 생성입니다. 일반 관리 작업마다 재인증을 요구하는 것은 아니며 각 모듈에서 호출 여부를 확인해야 합니다.

관리자 자격증명 변경은 모든 관리자 세션과 도전을 해제합니다. 인증앱 교체는 이전 인증수단·복구 코드를 바꾸고 다른 관리자 세션을 해제합니다. 민감 작업 재인증은 `admin_security_log`에 기록하며 이 테이블은 최근 1,000건으로 제한됩니다. 재인증만으로 데이터 내보내기 스냅샷의 `data_revision`이 바뀌지 않도록 일반 업무 감사와 분리되어 있습니다.

## 동아리 로그인과 독점 대여권한

동아리당 계정은 하나이며 신규 가입은 `PENDING`, 관리자가 승인하면 `APPROVED`, 정지하면 `SUSPENDED`입니다. 승인 대기 계정도 일부 세션·자격증명 동작은 가능하지만 예약·내 동아리 승인 전용 보고는 제한됩니다. 동아리 비활성화, 계정 버전 변경, 정지·삭제는 기존 세션의 쓰기 권한을 잃게 합니다.

로그인 기기마다 `club_sessions`를 만들고 장소대여 임대는 `club_rental_leases` 한 행으로 관리합니다. 임대는 180,000ms이며 소유자의 heartbeat만 현재 임대를 연장합니다. 임대가 비면 아직 살아 있고 최근 heartbeat가 있는 가장 먼저 생성된 세션을 선택합니다. 대기 세션이 heartbeat를 보낸다고 소유권을 빼앗거나 다른 소유자의 임대를 연장할 수 없습니다. 대여 임대 없는 승인 사용자는 내 동아리 보고를 볼 수 있으나 예약 목록·예약·취소·확인서 등 대여 작업은 423(`scope: rental`)으로 거절됩니다.

계정 수정은 `version`을 증가시키며 DB 트리거가 해당 계정의 모든 `club_sessions`를 삭제합니다. 연관 임대도 CASCADE로 정리됩니다. 기존 `session_token`, `session_expires` 열은 이전 세션 이전을 위한 호환 흔적이며 현재 세션의 기준은 별도 테이블입니다. [accounts.mjs](../../lib/accounts.mjs), [rental-sessions.test.mjs](../../tests/rental-sessions.test.mjs), [accounts.test.mjs](../../tests/accounts.test.mjs)를 참고하세요.

## 조회 계정과 공유 링크

조회 전용 계정은 MFA를 요구하지 않으며 예약 최소 필드만 읽습니다. 관리자 기능·전체 개인정보·CSV 권한은 없습니다. 조회 계정으로 로그인하면 같은 브라우저에 있던 관리자 세션·도전을 DB에서 취소합니다. 계정 수정·중지는 버전 증가와 기존 조회 세션 삭제로 즉시 반영합니다. background 조회는 미사용 시간을 연장하지 않고 `readerActivity`가 활동을 기록합니다.

링크는 무작위 원문 토큰을 생성 시 한 번 반환하고 `reservation_share_links.token_hash`만 저장합니다. 메타데이터·감사 기록에서 원문을 재조회할 수 없습니다. `shareRedeem`은 유효한 링크를 별도 쿠키 세션으로 교환합니다. 현재 구현은 조회 대상 날짜 최대 7일, 링크 만료 최대 생성 시점부터 365일, 세션 최대 7일을 별개 정책으로 사용합니다. 링크가 오래 살아도 1년짜리 접속 쿠키를 발급하지 않습니다. 날짜/장소 범위와 정지 상태를 매 요청에 검사합니다. 상수는 [reservation-link-policy.mjs](../../lib/reservation-link-policy.mjs), 권한 검증은 [reservation-read.test.mjs](../../tests/reservation-read.test.mjs)에 있습니다.

## 비밀번호·암호화 키

| 비밀 또는 키 | 현재 용도 | 보관·변경 시 주의 |
| --- | --- | --- |
| `ROOM_KEY` | 동아리방 비밀번호 AES-GCM; 사용량 조회 토큰용 파생 키 | 기존 암호문 복호화에 필요 |
| `BOOKING_KEY` | 예약 확인코드 HMAC; 관리자·동아리·조회 계정 비밀번호 pepper | 변경하면 기존 비밀번호 검증·확인코드에 영향 |
| `PII_KEY` | 임원 연락처 JSON·지도교수·예약 대표자/전화/메모/추가승인 사유·벌점 사유 | DB만으로 복호화 불가; 별도 키 백업 필요 |
| `MFA_KEY` | 관리자 TOTP 비밀 암호화·복구 코드 HMAC | 인증앱·복구 코드 사용에 필요 |
| `BOOTSTRAP_TOKEN` | 최초 관리자 설정 | 초기 준비의 서버 비밀 |
| `PRIVATE_PASSWORD` | 비공개 사이트 접근 | 관리자 비밀번호와 별개 |

비밀번호는 PBKDF2-SHA-256 100,000회와 개별 salt를 사용합니다. 현재 관리자 해시는 `v2:` 접두어이며 `BOOKING_KEY` HMAC으로 pepper 처리합니다. 구형 관리자 해시는 정상 로그인 때 현재 방식으로 승격합니다. 동아리·조회 계정도 목적별 문자열을 붙인 `BOOKING_KEY` HMAC 후 PBKDF2를 적용합니다. `club_accounts.password_cipher`는 빈 문자열만 허용하고 `accountSecret`은 410으로 원문 조회를 거절합니다.

AES-GCM은 256비트 키와 매 암호화마다 새 12바이트 IV를 사용합니다. 개인정보는 `enc:v1:` 접두어로 구분하며 비어 있지 않은 평문·잘못된 키·손상된 암호문은 실패합니다. 개인정보 전환이 완료되면 DB 트리거도 대상 열의 비어 있지 않은 평문 쓰기를 거절합니다. 트리거의 접두어 검사가 암호문 무결성을 완전히 검증하는 것은 아니며 실제 복호화 시 GCM 인증도 적용됩니다.

키 원본은 배포 폴더의 `.secrets/runtime.json`과 Worker secret으로 관리하며 D1의 키 테이블에 넣지 않습니다. 앱의 암호화가 운영자 PC·기존 SQL 사본·브라우저에 이미 내려간 정보까지 보호하지는 않습니다. 복구에 필요한 키를 재생성하지 말고 [백업·복구 절차](../05-database/data-management.md)를 따르세요.

## 헤더·오류·검증 범위

[public/_headers](../../public/_headers)는 자산에 CSP, HSTS, `nosniff`, 프레임 차단, referrer·권한 정책을 선언합니다. Worker는 API 응답에도 HSTS, `nosniff`, 프레임 차단, `no-referrer`, 카메라·마이크·위치 차단을 설정합니다. 일반 오류 응답은 내부 SQL/키/암호문 오류를 사용자용 메시지로 바꿉니다.

[security-hardening.test.mjs](../../tests/security-hardening.test.mjs)는 RFC HOTP 벡터, OTP 재사용·복구 코드 동시 사용, 미검증 세션 차단, 15분/8시간 경계, 재인증 경합, 개인정보 암호화·평문 트리거, 백업 무결성 등을 검사합니다. [reservation-read.test.mjs](../../tests/reservation-read.test.mjs)는 권한 상승·최소 필드·범위 조작·즉시 취소를 검사합니다. 테스트 코드의 존재와 특정 실행의 성공, 실제 운영 환경의 보안 상태는 별개입니다. 과거 [보안 업데이트 안내](history/SECURITY_UPDATE.md)에 있는 외부 서비스 한도·적용 상태는 현재 운영 검증 결과로 인용하지 않습니다.
