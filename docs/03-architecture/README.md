# 아키텍처 문서

이 디렉터리는 현재 저장소의 React 클라이언트, Cloudflare Worker, D1, 인증·암호화, 배포 도구가 어떻게 연결되는지 설명합니다. 현재 동작은 실행 코드와 테스트를 기준으로 정리했습니다. 실제 운영 계정의 배포 상태나 데이터는 이 문서 작성 과정에서 조회하지 않았습니다.

| 문서 | 읽는 목적 |
| --- | --- |
| [시스템 개요](system-overview.md) | 실행 단위, 소스 책임, 기술 선택과 동시성 경계를 이해합니다. |
| [API와 데이터 흐름](api-and-data-flow.md) | 단일 API 진입점, 권한별 처리, 예약·조회·내보내기 경로를 추적합니다. |
| [인증과 보안](authentication-and-security.md) | 관리자 MFA, 동아리 세션, 조회 권한, 키와 개인정보 보호를 확인합니다. |
| [배포와 운영](deployment-and-operations.md) | 로컬 검증, 기존 설정을 보존하는 업데이트, 백업·장애 대응 절차를 확인합니다. |
| [예약 조회 접근 설계](READ_ACCESS_DESIGN.md) | 조회 전용 계정·공유 링크 기능을 설계할 당시의 배경과 검증 계획을 확인합니다. |
| [보안 업데이트 이력](history/SECURITY_UPDATE.md) | 보안 전환을 도입할 당시의 안내를 확인합니다. |

`READ_ACCESS_DESIGN.md`와 `history/` 문서는 설계·변경 당시의 기록입니다. 예전 버전 번호, 적용 여부, 시간·서비스 한도에 관한 문장이 현재 운영 상태를 증명하지 않습니다. 현재 정책은 [인증과 보안](authentication-and-security.md), 실제 테이블은 [데이터베이스 스키마](../05-database/schema-and-relations.md), 변경 적용은 [마이그레이션](../05-database/migrations.md)을 우선 확인하세요.

문서 탐색: [프로젝트 문서 목차](../../README.md) · [데이터베이스 문서](../05-database/README.md)

계층 분리의 현재 진행 상황과 새 코드 배치 규칙은 [계층 분리 작업 기준](refactoring-boundaries.md)을 참고하세요.
