# 배포와 운영

이 문서는 저장소에 구현된 명령의 동작과 운영 순서를 설명합니다. 문서 작성 중 실제 배포·원격 DB 변경·운영 비밀 조회는 수행하지 않았습니다. 배포 주소·현재 공개 여부·Cloudflare 요금제 한도는 실제 운영 설정에서 별도로 확인해야 합니다.

## 로컬 사전 확인

[package.json](../../package.json)은 Node.js `>=22.13.0`을 요구합니다. 깨끗한 소스에서 다음 순서로 검증합니다.

```powershell
npm ci
npm run build
npm run check
npm test
npm run check:worker
npm run check:runtime
```

`build`는 Vite가 `dist/`를 생성합니다. 일부 테스트와 업데이트 패키지 검사는 `dist/`를 읽으므로 먼저 빌드해야 합니다. `check`는 TypeScript 검사, `test`는 Node 테스트입니다. `check:worker`는 예제 설정으로 `wrangler deploy --dry-run`을 실행하여 `worker-dist/worker.js`를 만들며 실제 배포가 아닙니다. `check:runtime`은 이 산출물과 Miniflare의 로컬 D1에서 인증·예약·암호화·마감·조회권한 등 통합 경로를 검사합니다. `check:worker` 이후 실행해야 합니다. [runtime-check.mjs](../../scripts/runtime-check.mjs), [tests/](../../tests/)가 근거입니다.

검증 기록에는 실행한 명령·결과·환경·실패를 남깁니다. 저장소의 과거 PASS 기록만으로 지금 코드가 검사에 통과했다고 말하거나 로컬 테스트를 실제 운영·휴대전화 검증으로 표현하지 마세요.

## 설정 파일과 보호할 정보

| 파일·디렉터리 | 역할 |
| --- | --- |
| [wrangler.example.json](../../wrangler.example.json) | 비공개 기본값과 자리표시 DB ID를 가진 배포 예제 |
| `wrangler.json` | 실제 Worker 이름·DB ID·공개 범위·자산 바인딩 |
| `.secrets/runtime.json` | 기존 암호화·인증 키 원본 |
| `.secrets/setup-info.txt` | 비공개 접근 및 최초 설정 안내 |
| `backups/` | 암호화 DB 백업과 업데이트 전 소스 사본·manifest |
| `.secrets/key-backups/` | DB와 별도 암호로 보호한 키 백업 |

실제 설정과 `.secrets`를 예제 파일로 덮어쓰거나 새 DB로 바꾸면 기존 서비스 연결과 복호화가 깨질 수 있습니다. 운영 폴더를 식별할 때 실제 `wrangler.json`, `.secrets/runtime.json`, 설치된 Wrangler가 있는지 확인합니다. 키·백업 암호·SQL 원본·인증 토큰은 채팅이나 공개 저장소에 붙이지 않습니다.

예제는 `workers_dev=false`, `preview_urls=false`, `SITE_PUBLIC='false'`, `run_worker_first=true`, `ASSETS=./dist`, SPA fallback을 사용합니다. 이는 배포 예제의 값이며 운영 구성이 반드시 같다는 뜻은 아닙니다.

## 신규 준비와 공개 범위 명령

[hosting.mjs](../../scripts/hosting.mjs)의 명령은 원격 자원을 바꿀 수 있습니다. 아래 명령은 동작을 설명하기 위한 운영 참조이며 단순 로컬 검사로 실행하지 않습니다.

| 명령 | 실제 동작 |
| --- | --- |
| `npm run prepare:hosting` | Cloudflare 로그인·계정 확인, 설정이 없으면 D1 생성, 비공개 설정 저장, 기존 키 유지/필요 키 생성, 원격 마이그레이션, Worker 배포, secret 등록, 개인정보 전환 |
| `npm run publish:private` | 기존 설정의 workers.dev 활성화, 비공개 접근 게이트를 모든 자산 앞에 적용하고 배포 |
| `npm run publish:public -- --approved` | 스크립트의 명시 플래그 검사 후 `SITE_PUBLIC='true'`, `/api/*`만 Worker 우선 처리로 바꾸고 배포 |
| `npm run backup` | 원격 D1을 내보내 암호화하고 별도 키 백업 생성, 구형 평문 백업 보호 |

`prepare`는 이미 공개된 구성을 임의로 비공개로 되돌리지 않고 거절합니다. 설정 파일이 없다면 새 DB를 만들 수 있으므로 기존 사이트 업데이트에 신규 준비 명령을 대체 사용하지 않습니다. 공개 플래그는 앱 계정 권한을 없애지 않습니다. 관리자·동아리·조회권한은 계속 서버에서 검사합니다.

## 기존 사이트 업데이트

`APPLY_SITE_UPDATE.cmd`/`npm run update:site`와 `APPLY_ACCOUNT_UPDATE.cmd`/`npm run update:accounts`는 [apply-site-update.mjs](../../scripts/apply-site-update.mjs) 및 [apply-account-update.mjs](../../scripts/apply-account-update.mjs) 경로로 기존 배포 폴더를 갱신합니다. 새 소스 패키지는 기존 운영 폴더와 다른 폴더에 준비합니다. `--deploy` 없는 `applyUpdate` 호출은 파일만 적용하며 원격 DB/배포를 실행하지 않습니다.

도구는 대상의 이름·`DB` 바인딩·실제 DB ID·표준 `migrations`/`worker.mjs`/`dist` 경로·기존 키 파일을 검사합니다. 사용자 지정 경로는 자동 추측해서 변경하지 않습니다. 배포 모드에서 대상 Wrangler 미설치와 새 패키지 자체를 대상으로 지정한 경우도 거절합니다.

배포 모드의 순서는 다음과 같습니다.

1. 서로 다른 DB 백업 암호와 키 백업 암호를 받습니다. 원격 DB를 암호화해 저장·검증하고 구형 평문 백업도 보호합니다. 이 단계 실패는 소스 교체 전 중단합니다.
2. 기존 파일을 `backups/site-update-<시각>-<식별값>/`에 복사하고 manifest를 남긴 뒤 새 파일을 적용합니다. 현재 문서 트리 `docs/`도 재귀적으로 복사합니다. 기존 운영 폴더의 이전 루트 안내 파일은 자동 삭제하지 않습니다.
3. 대상 폴더에서 `npm ci`로 도구를 설치하고 기존 `ROOM_KEY`·`BOOKING_KEY`를 보존합니다. 필요한 `PII_KEY`·`MFA_KEY`만 보충하고 현재 키의 별도 암호화 백업을 만듭니다.
4. 원격 D1 마이그레이션을 적용하고 Worker secret을 등록합니다.
5. 같은 배포 이름·DB 연결·공개 범위를 유지한 채 Worker를 배포합니다.
6. 기존 개인정보를 암호화·검증하고 `privacy_state.ready=1`로 업무 API를 활성화합니다.

실제 `wrangler.json`·키 원본·DB ID·계정 자격증명·공개 범위는 업데이트의 일반 복사 목록에 넣지 않습니다. 과거 원본 파일을 보관한다고 원격 스키마·데이터·배포를 자동으로 되돌리는 기능이 생기는 것은 아닙니다. [update.test.mjs](../../tests/update.test.mjs)는 설정/키 보존, 백업 선행, 실패 중단, 문서 복사·기존 파일 백업 등 업데이트 계약을 검사합니다.

## 개인정보 전환과 장애 대응

[security-migration.mjs](../../scripts/security-migration.mjs)는 기존 키 형식을 검사하고 개인정보 대상 행을 키 기준 200행씩 읽습니다. 평문만 암호화하고 기존 암호문은 복호화 검증합니다. 변경 SQL은 최대 100문장씩 적용하고 대상 7개 열의 평문 잔여 건수가 모두 0인지 확인한 뒤 `ready=1`로 바꿉니다. 전환이 끝나기 전 업무 API의 503은 부분 전환 데이터 노출을 막는 게이트입니다.

| 증상 | 확인과 조치 |
| --- | --- |
| 사이트 전체가 401 | 비공개 게이트의 ID·암호와 현재 공개 범위를 확인합니다. 앱 관리자 비밀번호와 구분합니다. |
| API가 503 | DB/4개 키 형식 누락인지 `privacy_state.ready=0` 전환 중인지 구분합니다. 기존 키를 새로 만들거나 ready만 강제로 바꾸지 않습니다. |
| 마이그레이션 실패 | 도구는 배포 전 멈춥니다. 원본 백업·로그·대상 폴더를 확인하고 같은 업데이트의 실패 원인을 해결합니다. |
| 개인정보 검증 실패 | API를 활성화하지 않습니다. 기존 키를 보존한 채 같은 전환을 재실행합니다. 이미 암호화한 행은 다시 평문으로 해석하지 않습니다. |
| 대여 화면이 423 | 해당 동아리의 다른 유효 세션이 대여 임대를 소유할 수 있습니다. 소유자 로그아웃·임대 만료·heartbeat 경로를 확인합니다. |
| CSV/마감이 409 | 자료 버전·세션·진행 단계가 바뀌었습니다. 처리 건수를 확인하고 남은 대상의 미리보기·내보내기를 다시 진행합니다. |
| 사용량 조회 실패 | 조회 계정·읽기 토큰·마지막 집계 시각을 확인합니다. 연결 안 됨/갱신 실패를 사용량 0으로 해석하지 않습니다. |

프로세스 정상 종료 시 임시 SQL은 `finally`로 삭제되지만 PC 강제 종료·전원 차단 후 `.secrets/backup-*.sql`, 암호화 전환 임시 SQL이 남을 수 있습니다. 복구용 원본인지 확인하고 보호된 작업 공간에서 정리합니다. 백업·복구·영구 삭제 절차는 [데이터 관리](../05-database/data-management.md), 원격 스키마 변경의 주의점은 [마이그레이션](../05-database/migrations.md)에 있습니다.

사용량 화면의 `FREE_LIMITS`는 [data-metrics.mjs](../../lib/data-metrics.mjs)에 고정된 비교 기준입니다. 실제 계정·요금제의 최신 한도나 과금 정책을 보증하지 않으며, 운영 변경 전에 Cloudflare 계정에서 확인해야 합니다. 이 문서는 현재 외부 서비스 수치를 검증했다고 주장하지 않습니다.
