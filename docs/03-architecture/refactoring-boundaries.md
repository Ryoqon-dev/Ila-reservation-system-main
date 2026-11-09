# 계층 분리 작업 기준

이 문서는 Issue #3의 점진적 리팩터링 기준입니다. 아래 목표는 아직 완성된 디렉터리 구조가 아니며 기존 파일은 이행 중입니다. 예약·권한·암호화·DB 및 HTTP 계약을 변경하지 않고 기능별로 분리합니다.

## 현재 책임과 상태

- `src/App.tsx`: 앱 셸과 화면 선택, 예약·관리·점검 UI와 화면별 상태를 함께 보유합니다. `server-clock`, `accounts`, `api-client` 및 여러 화면 모듈을 조립합니다.
- `src/accounts.tsx`: 동아리 세션 Context와 로그인, 예약 기록, 동아리·계정 관리 UI 및 각 화면의 로컬 상태를 보유합니다. `App.tsx`가 공개 컴포넌트와 Context를 사용합니다.
- `lib/service.mjs`: Worker API의 요청 처리·권한 검사와 여러 도메인 작업의 분기 및 공통 응답을 조립합니다. `lib/accounts.mjs`, `admin-auth.mjs`, `privacy.mjs` 등 기존 모듈에 의존합니다. 공개 진입점은 `handleApi`이며 `passwordHash`도 재내보냅니다.
- `lib/rules.mjs`: 예약 시간·날짜 규칙과 호환성을 위한 기존 공개 진입점입니다. 범용 입력 함수는 `lib/common/input.mjs`, 계정 자격 증명 규칙은 `lib/modules/accounts/credentials.mjs`에 두고 이전 이름을 재내보냅니다. 브라우저와 Worker 모두 이 모듈을 사용하므로 두 환경에서 실행 가능한 의존성만 허용합니다.
- `src/api-client.mjs`, `src/server-clock.tsx`, `lib/security.mjs`, `lib/opening-time.mjs`, `lib/data-export.mjs`는 기존 공통 구현입니다. 새 추상화를 만들기 전에 재사용 여부를 검토합니다.

`App.tsx`와 `accounts.tsx`의 화면 상태 및 Context 분리는 미완료입니다. `service.mjs`의 분기 이동 시 인증·CSRF·트랜잭션 경계를 호출 경로별로 확인해야 합니다. 현재의 기존 파일 간 교차 의존을 목표 계층의 완성으로 간주하지 않습니다.

## 목표와 의존 방향

- `core`: 애플리케이션 진입, 제공자·라우팅·요청 및 인증 경계 조립.
- `modules/<도메인>`: 해당 업무의 규칙·데이터와 도메인 전용 컴포넌트. `features`는 그 안의 사용자 기능을 나타냅니다.
- `common`: 특정 도메인에 의존하지 않는 입력 검증과 데이터 형식. 도메인, UI, 서버 진입점으로 역의존하지 않습니다.
- `kits`: 실제로 여러 곳에서 동일한 의미와 접근성·상태 동작을 공유하는 UI 및 Hook. 도메인 로직을 포함하지 않습니다.

새 코드는 `core → modules → common/kits`, `kits → common` 방향을 따릅니다. 도메인 간 직접 참조는 최소화하고 필요한 공개 API를 명시적으로 내보냅니다. 순환 참조를 만들지 않으며 기존 파일 이동만으로 계층 적용이 끝났다고 판단하지 않습니다. 서버 전용 코드를 브라우저 공유 경로에 넣지 않습니다. 현재 `rules.mjs` 재내보내기는 기존 호출을 보존하기 위한 이행용 호환 경계입니다.

## 후속 작업과 검토

`App.tsx`, `accounts.tsx`, `service.mjs`를 기능별로 분리하고, Field/Dialog의 실제 접근성·닫기 동작을 비교한 뒤에만 kit을 추출합니다. 기능별 DTO, 스타일 분리와 자동 import 경계 검사는 별도 단계입니다. 각 변경에서 기존 테스트, 타입 검사, 빌드와 Worker 검사를 수행하고 변경한 화면의 PC·모바일 및 접근성을 확인합니다. PR에는 영향 범위, 검증 결과, 위험과 롤백 방법을 기록합니다. 이 문서는 아직 전체 의존 그래프·순환 참조 감사나 시각 회귀 검사가 완료됐다는 뜻이 아닙니다.
