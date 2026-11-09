# Repository Rules for Codex

1. 작업 시작 시 `README.md`의 브랜치 운영 규칙을 확인하고 현재 브랜치 및 원격 `main`/`develop` 상태를 확인한다.
2. `main`에서 직접 개발·수정·커밋·push하지 않는다. 변경은 `develop` 또는 여기에서 분기한 작업 브랜치에서 수행한다.
3. `main` 반영은 `develop → main` PR을 생성하고 diff, 테스트 및 리뷰를 확인한 뒤 병합한다. 테스트 실패나 충돌이 있으면 병합하지 않는다.
4. 사용자가 명시적으로 요청하지 않으면 PR을 자동 병합하지 않는다. 긴급 수정도 PR 기록을 남기고 `develop`에 동기화한다.
5. 정책 또는 GitHub 보호 설정이 없거나 충돌하면 임의로 우회하지 않고 상태와 필요한 조치를 보고한다. `main` force push와 삭제는 금지한다.
6. 보호 설정은 이 문서가 아닌 GitHub에서 강제한다. 현재 상태와 운영 절차는 `docs/03-architecture/branch-workflow.md`를 확인한다.
