# 모듈별 책임

## UI와 API 경계

| 파일·그룹 | 책임 | 주요 검사 |
|---|---|---|
| [main.tsx](../../src/main.tsx), [App.tsx](../../src/App.tsx) | React 마운트·상위 공급자·내비게이션·예약/관리 화면 조합 | [ui-check](../../tests/ui-check.mjs), [시스템](../../tests/system.test.mjs) |
| [api-client.mjs](../../src/api-client.mjs) | JSON 전송·타임아웃·인증 오류 분류 | [API 클라이언트](../../tests/api-client.test.mjs) |
| [accounts.tsx](../../src/accounts.tsx), [admin-security.tsx](../../src/admin-security.tsx) | 동아리 세션/대여 입장, 관리자 MFA·재인증 | [계정](../../tests/accounts.test.mjs), [보안](../../tests/security-hardening.test.mjs) |
| [server-clock.tsx](../../src/server-clock.tsx), [scheduled-openings.tsx](../../src/scheduled-openings.tsx) | 서버 시각·자동 오픈 표시와 관리 | [자동 오픈](../../tests/scheduled-openings.test.mjs) |
| [reservation-read.tsx](../../src/reservation-read.tsx), [reservation-timetable.tsx](../../src/reservation-timetable.tsx) | 조회 계정·링크·최소 예약 시간표·PNG | [조회](../../tests/reservation-read.test.mjs), [시간표](../../tests/reservation-timetable.test.mjs) |
| [catalog.tsx](../../src/catalog.tsx), [club-profile.tsx](../../src/club-profile.tsx), [club-floorplan.tsx](../../src/club-floorplan.tsx) | 동아리 분류·임원·방 정보·공개 안내 목록 | [목록/방](../../tests/catalog-rooms.test.mjs), [프로필](../../tests/club-profile.test.mjs) |
| [site-content.tsx](../../src/site-content.tsx), [site-editor.tsx](../../src/site-editor.tsx), [image-upload.ts](../../src/image-upload.ts) | 사이트 설정 로드·편집·이미지 전처리 | [콘텐츠](../../tests/content.test.mjs) |
| [data-manager.tsx](../../src/data-manager.tsx), [photo-submission.tsx](../../src/photo-submission.tsx) | 자료 정리·사용량 UI, 사진 제출 상태 | [데이터](../../tests/data-management.test.mjs), [사진](../../tests/photo-submission.test.mjs) |

## 서버 모듈

| 파일·그룹 | 책임 |
|---|---|
| [worker.mjs](../../worker.mjs) | 비공개 접속문·경로/메서드·필수 키 확인·정적 자산 전달·보안 응답 헤더 |
| [service.mjs](../../lib/service.mjs) | 요청 파싱·핵심 예약/운영 API·인증 헬퍼·기능 모듈 조합 |
| [accounts.mjs](../../lib/accounts.mjs), [admin-auth.mjs](../../lib/admin-auth.mjs), [admin-session-policy.mjs](../../lib/admin-session-policy.mjs) | 대표 계정, 관리자 MFA/재인증과 미사용 만료 상수 |
| [rules.mjs](../../lib/rules.mjs), [opening-time.mjs](../../lib/opening-time.mjs), [scheduled-openings.mjs](../../lib/scheduled-openings.mjs) | 장소/시간/날짜 검증·한국시간·자동 오픈 |
| [security.mjs](../../lib/security.mjs), [privacy.mjs](../../lib/privacy.mjs), [totp.mjs](../../lib/totp.mjs) | 암호화·해시·오류·개인정보 변환·OTP |
| [reservation-read.mjs](../../lib/reservation-read.mjs), [reservation-link-policy.mjs](../../lib/reservation-link-policy.mjs), [reservation-timetable.mjs](../../lib/reservation-timetable.mjs), [booking-order.mjs](../../lib/booking-order.mjs) | 조회 범위/수명·시간표 최소화·예약 정렬 |
| [club-profile.mjs](../../lib/club-profile.mjs), [club-rooms.mjs](../../lib/club-rooms.mjs), [floorplan-defaults.mjs](../../lib/floorplan-defaults.mjs) | 동아리 메타데이터·임원/방·배치도 좌표 |
| [catalog.mjs](../../lib/catalog.mjs), [site-content.mjs](../../lib/site-content.mjs), [site-defaults.mjs](../../lib/site-defaults.mjs) | 안내 카탈로그·사이트/이미지 설정·기본값 |
| [data-management.mjs](../../lib/data-management.mjs), [data-export.mjs](../../lib/data-export.mjs), [data-metrics.mjs](../../lib/data-metrics.mjs) | 초기화/영구 정리 작업·CSV·사용량 조회 |
| [penalties.mjs](../../lib/penalties.mjs), [navigation.mjs](../../lib/navigation.mjs), [legacy-calendar.mjs](../../lib/legacy-calendar.mjs) | 벌점 계산·화면 키/안내 선택·기존 달력 호환 |

## DB·배포·검증

[마이그레이션 안내](../05-database/migrations.md)가 SQL 0001~0012의 적용 순서와 변경을 설명합니다. 운영 도구는 [hosting.mjs](../../scripts/hosting.mjs)의 준비/공개/백업, [apply-account-update.mjs](../../scripts/apply-account-update.mjs)의 누적 업데이트, [secure-backup.mjs](../../scripts/secure-backup.mjs)와 [restore-backup.mjs](../../scripts/restore-backup.mjs)의 백업·복호화로 나뉩니다.

`APPLY_SITE_UPDATE.cmd`와 `APPLY_REVIEW_UPDATE.cmd`는 각 진입 스크립트를 거쳐 같은 업데이트 구현을 사용합니다. `tests/`는 Node 자동 검사와 정적 UI/로컬 Worker 보조 코드를 포함합니다. 테스트별 상세 동작은 해당 테스트 본문을 확인하세요.

## Java Swing 관리자 프로그램

[desktop-admin](../../desktop-admin/README.md)은 기존 웹사이트와 별도로 만드는 Java 관리자 화면입니다. `modules/csv/`는 자료 종류·기간 선택, CSV 열기와 미리보기를 담당하고 `kits/csv/`는 CSV 읽기·저장·형식 검사를 담당합니다. 서버 자료 조회는 공통 `CsvExportService` 연결점으로 주입하며, 별도 HTTP 클라이언트를 만들지 않습니다.

[파일 구조 목차](README.md)
