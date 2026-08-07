# AGENTS.md

fishhook 저장소에서 작업할 때 알아야 할 규칙.

## 필수: 코드를 고쳤으면 반드시 함께 한다

동작을 바꾸는 작업(기능 추가, 버그 수정, 리팩터링으로 인한 동작 변화)은
**아래 셋을 모두 끝내야 완료**다. 하나라도 빠지면 작업이 끝난 게 아니다.
사용자가 따로 요청하지 않아도 기본으로 수행한다.

### 1. 문서 업데이트

- 바꾼 동작이 적힌 `docs/` 문서를 같이 고친다. 목록은 [docs/README.md](docs/README.md).
- 새 동작이 어느 문서에도 없으면 가장 가까운 문서에 절을 추가한다.
- 해당 문서 하단의 **수동 검증 체크리스트**에도 항목을 추가한다.
- 메시지 타입·storage 키·설정 항목·파일 구조가 바뀌면
  [docs/architecture.md](docs/architecture.md)와 이 문서(AGENTS.md), `README.md`도 확인한다.

특히 [jira-media-handling.md](docs/jira-media-handling.md)와
[adf-table-fallback.md](docs/adf-table-fallback.md)는 매칭 순서·치환 규칙이
단계별로 적혀 있어서, 코드만 고치면 바로 어긋난다.

### 2. 버전 업그레이드

`manifest.json`의 `version`을 올린다. **`package.json`이 없으므로 이게 유일한 패키지 버전이다.**

| 변경 | 올리는 자리 |
|------|------------|
| 버그 수정, 문구 수정, 스타일 보정 | patch (`0.2.6` → `0.2.7`) |
| 기능 추가, 설정 항목 추가, 동작 방식 변경 | minor (`0.2.6` → `0.3.0`) |
| 기존 설정·저장값과 호환되지 않는 변경 | major |

문서만 고친 커밋은 올리지 않는다.

### 3. 테스트

```bash
node --test
```

디렉터리 인자(`node --test test/`)는 Windows에서 모듈 해석 오류가 나므로
인자 없이 자동 탐색을 쓴다. 특정 파일만 돌릴 때는 경로를 직접 나열한다.

로직을 바꿨으면 `test/`에 케이스를 추가한다. UI는 자동 테스트가 없으므로
`chrome://extensions`에서 확장을 새로고침하고 문서의 수동 검증 체크리스트로 확인한다.

## 프로젝트 성격

- Chrome Extension Manifest V3. **빌드 도구·번들러·의존성 없음.**
- `package.json`이 없다. 패키지 버전은 `manifest.json`의 `version`이 유일한 소스다.
- 모든 스크립트는 클래식(non-module) 스크립트다. `import`/`export`를 쓰지 않는다.
  - content script는 IIFE로 감싸고 필요한 것만 `window`에 노출한다.
  - `src/adf-html.js`처럼 background와 test가 함께 쓰는 파일은
    service worker에서는 `importScripts()`, test에서는 `require()`로 로드된다.
    두 경로 모두에서 동작하도록 `globalThis` / `module.exports`를 함께 다룬다.

## 코드 규칙

- 파일 상단에 `'use strict';`.
- 로그 접두사: `[fishhook][background]`, `[fishhook][fisheye]` 등 `LOG` 상수로 통일.
- 메시지 타입은 `FISHHOOK_` 접두사. 현재 존재하는 것은 셋뿐이다.
  | 타입 | 방향 | 용도 |
  |------|------|------|
  | `FISHHOOK_FETCH_JIRA_CONTENT` | content → background | 이슈 본문/메타 fetch (`includeVideo` 옵션) |
  | `FISHHOOK_FETCH_JIRA_ATTACHMENT` | content → background | 첨부파일 바이트 fetch (CORS 우회) |
- **메시지 응답에 `ArrayBuffer`/`Blob`을 담지 않는다.** `chrome.runtime.sendMessage`는
  JSON 직렬화라서 `{}`로 뭉개진다. 바이너리는 base64 문자열로 건넨다
  ([jira-media-handling.md](docs/jira-media-handling.md) 참고).
  | `FISHHOOK_SHOW_DESCRIPTION_PREVIEW` | popup → content | 미리보기 패널 열기 |
- storage 키는 `fishhook.` 접두사 (`chrome.storage.local`).
- 사용자 노출 문구를 코드에 하드코딩하지 않는다. i18n 키를 쓴다.

## i18n 주의

**런타임이 실제로 읽는 것은 `src/i18n/i18n.js` 안의 인라인 메시지 객체다.**
`src/i18n/ko.yml` / `en.yml`은 원래 빌드 원본으로 설계됐지만
빌드 스크립트가 없어서 지금은 참조용 사본이다. `_locales/`도 없다.

문구를 고칠 때는 **`i18n.js`를 반드시 고치고**, yml도 같이 맞춰 두면 좋다.
yml만 고치면 화면에 아무 변화가 없다.

## 보안 기본값

- Jira에서 받은 HTML은 `sanitizeHtml`을 거친다. `<script>`, `<iframe>`, 이벤트 핸들러 속성 제거.
- ADF → HTML 변환(`src/adf-html.js`)에서 텍스트·속성은 전부 이스케이프하고,
  `href`는 `http(s):` / `mailto:` / `tel:` / `/`만 허용한다.
- background의 attachment fetch는 **설정된 Jira 호스트의 attachment 경로만** 허용한다.
- 매칭이 애매하면 엉뚱한 이미지를 보여주는 대신 placeholder로 떨어뜨린다.

## 작업 완료 체크리스트

작업을 마쳤다고 보고하기 전에 확인한다.

- [ ] `node --test` 통과
- [ ] 로직 변경분에 대한 테스트 추가
- [ ] 바뀐 동작이 `docs/`의 해당 문서에 반영됨
- [ ] 문서의 수동 검증 체크리스트에 항목 추가
- [ ] `manifest.json` `version` 상향
- [ ] `chrome://extensions` 새로고침 후 실제 동작 확인
