> [!IMPORTANT]
> ## 브랜치 운영 및 PR 필수 규칙
> - `main`은 안정·배포 기준 브랜치입니다. 직접 개발, 커밋, push를 하지 않습니다.
> - `develop`은 개발·통합 기준 브랜치입니다. 변경사항을 먼저 `develop`에 통합합니다.
> - `main` 반영은 **`develop → main` Pull Request를 생성하고 검증한 뒤 merge**합니다.
> - 기능·버그·문서 작업은 가급적 `feature/*`, `fix/*`, `docs/*`에서 진행하고 `develop`에 통합합니다.
> - 작업 시작 전에 [AGENTS.md](AGENTS.md)와 이 규칙을 확인합니다. 실제 보호 설정의 제약과 상세 절차는 [브랜치 운영](docs/03-architecture/branch-workflow.md)을 확인하세요.

# 일아 동아리 통합 관리 시스템

동아리 장소 예약, 대표 계정 승인, 동아리·벌점 관리와 관리자 운영을 지원합니다. 현재 애플리케이션 버전은 **1.10.1**이며, React/Vite 화면과 Cloudflare Workers/D1 서버로 구성됩니다.

## 문서 읽기

| 분야 | 시작 문서 | 주요 내용 |
|---|---|---|
| 01 개요 | [프로젝트 개요](docs/01-overview/README.md) | 목적·범위·사용자·기술 스택·개발 준비 |
| 02 기능 | [기능 명세](docs/02-features/README.md) | 예약·오픈·계정·동아리·벌점·조회 권한 |
| 03 아키텍처 | [구조와 운영](docs/03-architecture/README.md) | API·인증·암호화·배포·백업·복구 |
| 04 파일 구조 | [파일 안내](docs/04-file-structure/README.md) | 실제 Git 트리·모듈 책임·문서 이전표 |
| 05 데이터베이스 | [DB 명세](docs/05-database/README.md) | 테이블·제약·관계·마이그레이션 0001~0012 |
| 06 UI/UX | [화면과 흐름](docs/06-uiux/README.md) | 사용자별 화면·내비게이션·반응형·상태 |
| 07 남은 작업 | [백로그와 검증 기록](docs/07-todo-list/README.md) | 우선순위·완료 조건·기존 검증 이력 |

현행 정책은 각 분야의 본문을 읽고, 과거 버전의 적용·검사 기록은 각 분야의 `history/` 또는 `review-history/`에서 확인하세요. [기존 문서 이전표](docs/04-file-structure/document-migration.md)에 모든 경로가 있습니다.

## 로컬 준비와 검증

Node.js **22.13.0 이상**, npm이 필요합니다. 이 `README.md`와 `package.json`이 있는 저장소 루트에서 실행합니다.

```sh
npm ci
npm run check
npm run build
npm test
```

업데이트 도구 테스트가 `dist/`의 파일을 확인하므로 **빌드 후 테스트** 순서입니다. 추가 로컬 검증은 [기술 스택과 명령](docs/01-overview/tech-stack.md)을 참고하세요.

## Java Swing 관리자 프로그램

`desktop-admin/`에는 팀 프로젝트에서 새로 만드는 Java Swing 관리자 프로그램의 CSV 기능이 있습니다. 현재는 CSV 화면·읽기·저장·형식 검사를 구현했으며, 서버 연동은 팀 공통 `ApiClient`가 준비되면 연결하도록 분리했습니다. Java 21 이상에서의 컴파일 및 테스트 방법은 [Java CSV 모듈 안내](desktop-admin/README.md)를 참고하세요.

## 운영 주의사항

이 저장소에 푸시하거나 PR을 머지하는 것만으로 Cloudflare 운영 사이트가 배포되지는 않습니다. [배포·백업·복구 절차](docs/03-architecture/deployment-and-operations.md)를 먼저 읽으세요. 신규 설치와 기존 사이트 업데이트는 다른 작업입니다.

운영 설정 `wrangler.json`, `.secrets/`, 계정·토큰·실제 데이터·원문 백업은 Git에 넣지 않습니다. 기존 운영 DB·키·공개 범위를 유지하고, 복구 가능한 백업을 먼저 준비합니다. 로컬 자동 검사와 실제 운영 검증은 구분합니다.

외부 라이브러리 표기는 [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt)에 보존합니다.
