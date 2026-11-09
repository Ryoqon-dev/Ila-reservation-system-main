# UI/UX 문서

현재 React 화면·CSS·테스트에 근거해 화면 구성과 동작을 정리합니다. 제품 기능의 조건과 권한은 [기능 문서](../02-features/README.md)에서 확인하세요.

| 문서 | 목적 |
|---|---|
| [화면과 탐색](screens-and-navigation.md) | 주소, 메뉴, 관리자 탭, 사이트 설정 |
| [사용자 흐름](user-flows.md) | 가입·승인·예약·취소·사진 확인·조회 링크 |
| [반응형과 화면 상태](responsive-and-states.md) | 작은 화면, 팝업, 로딩·오류·만료, 접근성 |

이번 정리는 소스와 테스트의 사양을 문서화한 작업입니다. 실서비스 배포 상태·실제 모바일 기기·현재 브라우저 동작을 직접 검증했다는 의미가 아닙니다. 테스트를 읽어 확인한 기대 동작과 과거의 브라우저 검사 보고를 구분합니다.

## 이전 UI 변경 기록

- [PORTAL_LAYOUT_UPDATE.md](history/PORTAL_LAYOUT_UPDATE.md): 상단 메뉴·품목 목록·대여 공지·방 배치도 도입 당시 안내. 로컬 PC 및 390px 브라우저 검증 보고를 포함하며 실제 휴대폰 검증과 구분합니다.
- [SITE_SETTINGS_UPDATE.md](history/SITE_SETTINGS_UPDATE.md): 사이트 설정 도입 당시 사용·배포 안내. 현재 대여 공지는 메뉴 진입마다 표시하므로 과거의 자동 표시 OFF·읽음 유지 설명을 최신 규칙으로 적용하지 마세요.

기능 변경 이력은 [기능 기록 색인](../02-features/README.md#기능-도입-당시-기록), 전체 문서 진입점은 [프로젝트 개요](../01-overview/README.md)를 참고하세요.

근거: [화면 구성](../../src/App.tsx), [공통 스타일](../../src/styles.css), [렌더 검사 도우미](../../tests/render-check.tsx), [목록·메뉴 테스트](../../tests/catalog-rooms.test.mjs).
