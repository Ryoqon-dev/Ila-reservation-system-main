# 데이터베이스 문서

업무 데이터는 Worker의 `DB` 바인딩을 통해 Cloudflare D1에 저장합니다. 현재 스키마는 [migrations/0001~0012](../../migrations/)의 누적 결과입니다. 로컬 테스트는 SQLite 어댑터와 Miniflare D1을 사용하며 실제 운영 DB의 적용 상태는 별도로 확인해야 합니다.

| 문서 | 내용 |
| --- | --- |
| [스키마와 관계](schema-and-relations.md) | 38개 업무 테이블의 모든 열, 기본값·키·제약, 인덱스·뷰·트리거와 관계 |
| [마이그레이션](migrations.md) | 0001~0012 변경 의도, 보존 범위, 보안 전환과 적용·재실행 주의 |
| [데이터 관리](data-management.md) | CSV·학기 마감·영구 정리, 암호화 DB/키 백업과 복구 |
| [데이터 관리 업데이트 이력](history/DATA_MANAGEMENT_UPDATE.md) | 기능 도입과 후속 수정 당시 안내 |

이력의 SQL 평문 백업 안내·예전 재인증 시간·외부 서비스 한도는 현재 정책으로 사용하지 않습니다. 현재 백업은 DB와 키를 서로 다른 암호로 보호하며 관리자 미사용 만료는 15분입니다. 실제 구현과 [보안 문서](../03-architecture/authentication-and-security.md)를 우선하세요.

문서 탐색: [프로젝트 문서 목차](../../README.md) · [아키텍처](../03-architecture/README.md)
