# 디렉터리 트리

이번 문서 재편의 Git 추적 대상과 실제 생성된 Markdown을 기준으로 한 트리입니다. 로컬 저장 위치는 폴더명과 무관하며, `package.json`이 있는 곳이 저장소 루트입니다.

```text
Ila-reservation-system/
|-- docs/
|   |-- 01-overview/
|   |   |-- history/
|   |   |   `-- README-v1.10.1.md
|   |   |-- README.md
|   |   |-- goals-and-scope.md
|   |   |-- project-summary.md
|   |   `-- tech-stack.md
|   |-- 02-features/
|   |   |-- history/
|   |   |   |-- ACCOUNTS_UPDATE.md
|   |   |   |-- BOOKING_HISTORY_UPDATE.md
|   |   |   |-- CLUB_EDITOR_UPDATE.md
|   |   |   |-- CLUB_PORTAL_UPDATE.md
|   |   |   |-- CLUB_PROFILE_UPDATE.md
|   |   |   |-- PHOTO_SESSION_UPDATE.md
|   |   |   |-- READ_ACCESS_UPDATE.md
|   |   |   |-- RENTAL_ACCESS_UPDATE.md
|   |   |   `-- SCHEDULED_OPENING_UPDATE.md
|   |   |-- README.md
|   |   |-- accounts-and-permissions.md
|   |   |-- booking-access.md
|   |   |-- club-management.md
|   |   |-- penalties-and-photos.md
|   |   `-- reservation.md
|   |-- 03-architecture/
|   |   |-- history/
|   |   |   `-- SECURITY_UPDATE.md
|   |   |-- README.md
|   |   |-- READ_ACCESS_DESIGN.md
|   |   |-- api-and-data-flow.md
|   |   |-- authentication-and-security.md
|   |   |-- deployment-and-operations.md
|   |-- refactoring-boundaries.md
|   |   `-- system-overview.md
|   |-- 04-file-structure/
|   |   |-- README.md
|   |   |-- directory-tree.md
|   |   |-- document-migration.md
|   |   `-- module-responsibilities.md
|   |-- 05-database/
|   |   |-- history/
|   |   |   `-- DATA_MANAGEMENT_UPDATE.md
|   |   |-- README.md
|   |   |-- data-management.md
|   |   |-- migrations.md
|   |   `-- schema-and-relations.md
|   |-- 06-uiux/
|   |   |-- history/
|   |   |   |-- PORTAL_LAYOUT_UPDATE.md
|   |   |   `-- SITE_SETTINGS_UPDATE.md
|   |   |-- README.md
|   |   |-- responsive-and-states.md
|   |   |-- screens-and-navigation.md
|   |   `-- user-flows.md
|   `-- 07-todo-list/
|       |-- review-history/
|       |   |-- REVIEW.md
|       |   `-- issue-1-documentation.md
|       |-- README.md
|       |-- backlog.md
|       `-- priorities.md
|-- lib/
|   |-- common/
|   |   `-- input.mjs
|   |-- modules/
|   |   `-- accounts/
|   |       `-- credentials.mjs
|   |-- accounts.mjs
|   |-- admin-auth.mjs
|   |-- admin-session-policy.mjs
|   |-- booking-order.mjs
|   |-- catalog.mjs
|   |-- club-profile.mjs
|   |-- club-rooms.mjs
|   |-- data-export.mjs
|   |-- data-management.mjs
|   |-- data-metrics.mjs
|   |-- floorplan-defaults.mjs
|   |-- legacy-calendar.mjs
|   |-- navigation.mjs
|   |-- opening-time.mjs
|   |-- penalties.mjs
|   |-- privacy.mjs
|   |-- reservation-link-policy.mjs
|   |-- reservation-read.mjs
|   |-- reservation-timetable.mjs
|   |-- rules.mjs
|   |-- scheduled-openings.mjs
|   |-- security.mjs
|   |-- service.mjs
|   |-- site-content.mjs
|   |-- site-defaults.mjs
|   `-- totp.mjs
|-- migrations/
|   |-- 0001_initial.sql
|   |-- 0002_booking_access.sql
|   |-- 0003_club_accounts.sql
|   |-- 0004_site_content.sql
|   |-- 0005_club_portal.sql
|   |-- 0006_data_management.sql
|   |-- 0007_concurrent_club_sessions.sql
|   |-- 0008_catalog_rooms_contacts.sql
|   |-- 0009_club_profiles.sql
|   |-- 0010_security_hardening.sql
|   |-- 0011_scheduled_openings.sql
|   `-- 0012_reservation_read_access.sql
|-- public/
|   |-- assets/
|   |   |-- campus.jpg
|   |   |-- logo.png
|   |   `-- wordmark.png
|   |-- _headers
|   `-- robots.txt
|-- scripts/
|   |-- apply-account-update.mjs
|   |-- apply-review-update.mjs
|   |-- apply-site-update.mjs
|   |-- hosting.mjs
|   |-- restore-backup.mjs
|   |-- runtime-check.mjs
|   |-- secure-backup.mjs
|   `-- security-migration.mjs
|-- src/
|   |-- App.tsx
|   |-- accounts.tsx
|   |-- admin-security.tsx
|   |-- api-client.mjs
|   |-- catalog.tsx
|   |-- club-floorplan.tsx
|   |-- club-profile.tsx
|   |-- data-manager.tsx
|   |-- image-upload.ts
|   |-- main.tsx
|   |-- photo-submission.tsx
|   |-- reservation-read.tsx
|   |-- reservation-timetable.tsx
|   |-- scheduled-openings.tsx
|   |-- server-clock.tsx
|   |-- site-content.tsx
|   |-- site-editor.tsx
|   `-- styles.css
|-- tests/
|   |-- common-input.test.mjs
|   |-- account-helpers.mjs
|   |-- accounts.test.mjs
|   |-- api-client.test.mjs
|   |-- booking-history.test.mjs
|   |-- catalog-rooms.test.mjs
|   |-- club-profile.test.mjs
|   |-- content.test.mjs
|   |-- data-management.test.mjs
|   |-- data-metrics.test.mjs
|   |-- documentation.test.mjs
|   |-- image-fixtures.json
|   |-- manual-photo.test.mjs
|   |-- metrics-runtime-worker.mjs
|   |-- metrics-runtime.test.mjs
|   |-- photo-submission.test.mjs
|   |-- portal.test.mjs
|   |-- render-check.tsx
|   |-- rental-sessions.test.mjs
|   |-- reservation-read.test.mjs
|   |-- reservation-timetable.test.mjs
|   |-- scheduled-openings.test.mjs
|   |-- security-hardening.test.mjs
|   |-- system.test.mjs
|   |-- ui-check.mjs
|   |-- update.test.mjs
|   `-- worker.test.mjs
|-- .gitattributes
|-- .gitignore
|-- APPLY_ACCOUNT_UPDATE.cmd
|-- APPLY_REVIEW_UPDATE.cmd
|-- APPLY_SITE_UPDATE.cmd
|-- BACKUP_DATA.cmd
|-- README.md
|-- RESTORE_BACKUP.cmd
|-- THIRD_PARTY_NOTICES.txt
|-- index.html
|-- package-lock.json
|-- package.json
|-- tsconfig.json
|-- vite.config.ts
|-- worker.mjs
`-- wrangler.example.json
```

## 디렉터리의 목적

| 경로 | 역할 |
|---|---|
| `docs/` | 7개 분야별 현행 설명과 과거 원문; 각 README가 목차 |
| `src/` | React 화면·컨텍스트·입력/상태·브라우저 API 클라이언트 |
| `lib/` | 서버 기능과 UI가 공유하는 규칙·API·보안·자료 관리 |
| `migrations/` | D1 스키마·제약·트리거·뷰의 순차 변경 0001~0012 |
| `scripts/` | 신규 준비·업데이트·백업·복호화·로컬 런타임 검증 |
| `tests/` | Node 자동 검사와 정적 UI·로컬 Worker 보조 코드 |
| `public/` | 로고·건물 사진·정적 응답 헤더·robots |

## Git에 없는 로컬 생성물

`node_modules/`, `dist/`, `worker-dist/`, `.wrangler/`는 설치·빌드·로컬 검증 산출물입니다. `wrangler.json`, `.secrets/`, `backups/` 등은 운영 설정·실제 키·자료이며 이 트리에 포함하지 않습니다. 정확한 제외 규칙은 [.gitignore](../../.gitignore)를 확인하세요.

이전본의 문서 경로는 [이전표](document-migration.md)에 대응합니다. 파일별 동작은 [모듈 책임](module-responsibilities.md), 서버 관계는 [아키텍처](../03-architecture/README.md)를 읽으세요.

[파일 구조 목차](README.md)
