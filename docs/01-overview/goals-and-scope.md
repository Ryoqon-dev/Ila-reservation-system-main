# 목적과 범위

## 해결하려는 문제

날짜·장소·연속 시간대별 대여를 관리하면서 중복 예약을 막고, 동아리별 신청 이력과 벌점을 관리합니다. 담당자 교체 시 동아리 계정 승인·임원 정보·공지·로고를 같은 관리 체계에서 인수인계할 수 있게 합니다.

## 구현된 요구사항의 위치

| 요구사항 | 현행 설명 | 근거 |
|---|---|---|
| 예약 중복·연속 시간·일별 제약 | [예약](../02-features/reservation.md) | [규칙](../../lib/rules.mjs), [시스템 검사](../../tests/system.test.mjs) |
| 대표 계정 가입·승인·세션 | [계정과 권한](../02-features/accounts-and-permissions.md) | [계정 모듈](../../lib/accounts.mjs), [검사](../../tests/accounts.test.mjs) |
| 동아리 정보·방 배치·분류 | [동아리 관리](../02-features/club-management.md) | [방 관리](../../lib/club-rooms.mjs), [프로필 검사](../../tests/club-profile.test.mjs) |
| 벌점과 사진 제출 기록 | [벌점과 사진](../02-features/penalties-and-photos.md) | [벌점 규칙](../../lib/penalties.mjs), [사진 검사](../../tests/photo-submission.test.mjs) |
| 최소 권한 예약 조회·링크·시간표 | [예약 조회](../02-features/booking-access.md) | [조회 모듈](../../lib/reservation-read.mjs), [검사](../../tests/reservation-read.test.mjs) |
| 개인정보와 운영 자료 보호 | [인증과 보안](../03-architecture/authentication-and-security.md) | [개인정보](../../lib/privacy.mjs), [검사](../../tests/security-hardening.test.mjs) |

## 제품 범위

장소는 심정실·진리실·창의실이며 시간 슬롯은 09:00~21:00입니다. 대여 장비·게시판 안내 화면도 있지만, 안내 화면을 장비 재고 예약·결제 시스템이 구현된 것으로 해석하지 않습니다. 사진은 외부 오픈채팅 제출 여부를 기록하며, 예약 사진 파일을 서버에 업로드·보관하는 제품은 아닙니다.

장소·시간·검증 규칙의 상세 원본은 [기능 명세](../02-features/README.md)입니다. 화면 안내를 편집해도 서버의 예약 규칙은 변경되지 않습니다.

## 문서 재편 작업의 범위

[Issue #1](https://github.com/gu2417/Ila-reservation-system/issues/1)은 기존 Markdown의 실제 이동, 7개 분야의 현행 문서, 링크·업데이트 도구의 문서 경로 정비를 포함합니다. 애플리케이션 버전·예약 로직·DB 스키마·인증 정책 변경, 운영 배포·원격 마이그레이션·데이터 초기화·비밀키 변경은 포함하지 않습니다.

[개요 목차](README.md)
