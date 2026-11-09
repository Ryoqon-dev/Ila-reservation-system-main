# 04 파일 구조

1. [디렉터리 트리](directory-tree.md): 추적 파일과 로컬 생성물 구분.
2. [모듈별 책임](module-responsibilities.md): UI·API·DB·운영·검사 연결.
3. [문서 이전표와 유지보수](document-migration.md): 기존 문서의 새 위치, 추가·이동 규칙.

파일 구조는 애플리케이션 모듈을 재배치한 결과가 아니라, 기존 소스 구조를 설명하고 문서만 재편한 것입니다.

[루트로 돌아가기](../../README.md)

Issue #3의 단계적 변경으로 `lib/common/input.mjs`는 범용 입력·CSV 처리, `lib/modules/accounts/credentials.mjs`는 계정 자격 증명 규칙을 담당합니다. 기존 `lib/rules.mjs`는 예약 규칙과 호환용 재내보내기를 유지합니다. 자세한 이행 상태는 [계층 분리 작업 기준](../03-architecture/refactoring-boundaries.md)을 참고하세요.
