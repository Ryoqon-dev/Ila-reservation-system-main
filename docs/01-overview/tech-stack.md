# 기술 스택과 개발 준비

## 실행 환경과 구성

[package.json](../../package.json)과 [package-lock.json](../../package-lock.json)이 의존성의 기준입니다. 아래는 이번 문서 작성 시 저장소에 고정된 값이며 최신 버전 추천을 의미하지 않습니다.

| 영역 | 구성 |
|---|---|
| 로컬 런타임 | Node.js 22.13.0 이상, npm; 테스트에 `node:sqlite` 사용 |
| 화면 | React/React DOM 19.2.6, TypeScript 5.9.3 |
| 빌드 | Vite 8.3.4, @vitejs/plugin-react 6.0.2 |
| 화면 도구 | lucide-react 1.31.0, qrcode 1.5.4 |
| 서버/DB | Cloudflare Workers, D1, Wrangler 4.152.0 |
| 개발 의존성 override | undici 7.30.1 |

[Vite 설정](../../vite.config.ts)은 `dist/`를 빌드 시 비우고 새 정적 자산을 만듭니다. [Wrangler 예제](../../wrangler.example.json)는 실제 DB ID나 보안 키를 포함하지 않습니다. 비밀 설정은 [운영 절차](../03-architecture/deployment-and-operations.md)를 따릅니다.

## 개발 준비

저장소 루트(`package.json`이 있는 폴더)에서 다음 순서로 실행합니다.

```sh
npm ci
npm run check
npm run build
npm test
```

`npm ci`는 잠금 파일의 버전을 설치합니다. `check`는 타입 검사, `build`는 배포용 정적 화면 생성, `test`는 Node 테스트를 실행합니다. 업데이트 도구 검사에서 `dist/`를 사용하므로 빌드가 먼저 끝나야 합니다. 생성된 `node_modules/`, `dist/`와 `*.log`는 [.gitignore](../../.gitignore)에 의해 제외됩니다.

## 추가 검증

| 명령 | 실제 범위 |
|---|---|
| `npm exec -- vite build --ssr tests/render-check.tsx --outDir qa-render --emptyOutDir` 다음 `node tests/ui-check.mjs` | 정적 렌더용 번들 생성 후 UI 의미 검사; 실제 브라우저 클릭 검사가 아님 |
| `npm run check:worker` | Wrangler deploy dry-run, 로컬 Worker 번들 확인 |
| `npm run check:runtime` | 준비한 로컬 Worker 번들 및 Miniflare/D1 시나리오 |
| `npm run backup` | 실제 설정·인증이 필요한 운영 백업; 일반 개발 테스트 명령이 아님 |

런타임 검사는 `check:worker` 후 실행합니다. [runtime-check.mjs](../../scripts/runtime-check.mjs), [ui-check.mjs](../../tests/ui-check.mjs)를 기준으로 실패 내용을 확인하세요. `*.test.mjs`는 `npm test`에 포함되고 `render-check.tsx`와 같은 보조 파일이 모두 자동 실행되는 것은 아닙니다.

## 문제 확인

- `dist`가 없다는 오류: `npm run build`를 완료하고 테스트를 다시 실행합니다.
- `qa-render/render-check.js`가 없다는 오류: 위 SSR 검사 번들을 먼저 생성합니다. 일반 화면 빌드의 `dist/`와 별도 경로입니다.
- `node:sqlite` 지원 오류: 프로젝트 요구 버전의 Node를 사용 중인지 `node --version`으로 확인합니다.
- 로컬 Worker 실행 오류: 먼저 `check:worker` 산출물과 설치된 Wrangler를 확인합니다. 실제 Cloudflare 운영 배포로 우회하지 않습니다.
- 타입·테스트·빌드 실패는 기록하고 원인을 확인합니다. 다른 PR의 과거 통과 기록을 현재 검증으로 대신하지 않습니다.

[개요 목차](README.md)
