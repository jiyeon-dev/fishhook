# fishhook Harness Engineering Plan

## 목적

`fishhook`은 기존 `jira-preview-main` 프로젝트를 기준으로 다시 설계하는 Chrome Extension이다.
기존 프로젝트는 정상 동작하지만 Wiki copy, 옵션 페이지, FAB, Objectives 보조 기능 등 다수의 기능이 섞여 있다.

이번 프로젝트에서는 아래 기능만 남긴다.

- Fisheye 화면에서 Jira 이슈 키를 찾는다.
- 기능 1. 찾은 Jira 내용을 Objectives 에 붙여 넣어 보여준다.
- 기능 2. 찾은 Jira 내용을 Fisheye 우측 하단 팝업 패널에 보여준다.

하네스 엔지니어링의 목적은 실제 Chrome Extension 전체를 매번 로드하지 않아도 핵심 동작을 작게 검증할 수 있는 구조를 먼저 만드는 것이다.

## 기준 프로젝트에서 가져올 흐름

기존 `jira-preview-main`에서 참고할 핵심 흐름은 다음과 같다.

```text
Fisheye page
  -> fisheye-content.js
  -> Jira issue key 추출
  -> background.js에 Jira Description 요청
  -> background.js가 Jira API 또는 Jira browse 페이지에서 내용 수집
  -> Objectives 영역 또는 우측 하단 패널에 Jira 내용 표시
```

`fishhook`에서는 이 흐름만 남기고, Wiki copy 및 Jira 페이지 전용 복사 기능은 가져오지 않는다.

## 제거 대상

다음 기능은 설계 범위에서 제외한다.

- Jira Key details Wiki copy
- clipboard write
- Wiki 변환/미리보기
- Jira 페이지 전용 floating action button
- 옵션 페이지의 사이트 추가/삭제 UI
- 기존 방식의 Fisheye Objectives 수동 불러오기 텍스트 버튼
- `JIRA_WIKI_*` 네이밍

미디어 관련 참고:

- Objectives에서는 Jira 첨부 동영상을 재생한다.
- Description 미리보기 패널에서는 동영상을 `[VIDEO]` placeholder로만 표시한다.
- 상세 설계는 [jira-media-handling.md](./jira-media-handling.md)를 참고한다.

## 남길 기능 경계

### 1. Fisheye issue key extraction

역할:

- Fisheye 리뷰 제목, 제목 링크, 문서 제목에서 Jira issue key를 찾는다.
- `GS-12498` 같은 Jira 키를 반환한다.
- `RGS-6759` 같은 Fisheye review key는 Jira issue key로 취급하지 않는다.

기존 참고 파일:

- `/Users/avocado/Documents/jira-preview-main/fisheye-content.js`

분리 후보:

```text
src/fisheye/issue-key.js
```

검증 하네스:

```text
harness/key-extract.html
harness/fixtures/fisheye-review-basic.html
harness/fixtures/fisheye-review-title-link.html
harness/fixtures/fisheye-review-no-key.html
```

### 2. Jira content fetching

역할:

- issue key를 받아 Jira 내용 HTML/text를 가져온다.
- Jira REST API (`fields=summary,description,attachment`, `expand=renderedFields`)를 사용한다.
- ADF media 노드와 첨부파일 목록을 매칭해 rendered HTML의 error span을 보정한다.
- `includeVideo` 옵션으로 Objectives(동영상 재생)와 미리보기(`[VIDEO]` placeholder)를 구분한다.
- 로그인/권한/네트워크 실패를 구분 가능한 에러로 반환한다.

기존 참고 파일:

- `/Users/avocado/Documents/jira-preview-main/background.js`

현재 구현 파일:

```text
background.js
docs/jira-media-handling.md
```

검증 하네스:

```text
harness/jira-fetch-mock.html
```

초기 단계에서는 실제 Jira 호출 대신 mock 응답으로 시작한다.
실제 Jira 접근은 host permission 설계가 정리된 뒤 연결한다.

### 3. Objectives injection UI

역할:

- Fisheye의 Objectives 영역을 찾는다.
- 찾은 Jira 내용을 Objectives 영역에 붙여 넣어 보여준다.
- Jira 이미지·동영상 첨부를 `media-loader.js`로 인증 fetch 후 표시한다.
- 원래 Objectives 내용을 복원할 수 있어야 한다.
- 주입된 내용은 Fisheye 서버에 저장하지 않는 preview/injection으로 취급한다.

기존 참고 파일:

- `/Users/avocado/Documents/jira-preview-main/fisheye-content.js`
- `/Users/avocado/Documents/jira-preview-main/desc-panel-utils.js`
- `/Users/avocado/Documents/jira-preview-main/content.css`

분리 후보:

```text
src/fisheye/objectives-target.js
src/ui/objectives-injection.js
src/ui/objectives-injection.css
```

검증 하네스:

```text
harness/objectives-injection.html
harness/fixtures/fisheye-objectives-basic.html
harness/fixtures/fisheye-objectives-missing.html
```

Objectives 상태:

- `target-found`
- `target-not-found`
- `injected`
- `restored`
- `render-error`

### 4. Bottom-right panel UI

역할:

- Fisheye 우측 하단에 고정 패널을 표시한다.
- Jira issue key, Jira 링크, Jira Description 본문, 상태 메시지를 보여준다.
- 동영상은 재생하지 않고 `[VIDEO]` placeholder만 표시한다.
- 이미지는 Objectives와 동일하게 인증 fetch 후 표시한다.
- 닫기와 Jira 열기 링크를 제공한다.

기존 참고 파일:

- `/Users/avocado/Documents/jira-preview-main/desc-panel-utils.js`
- `/Users/avocado/Documents/jira-preview-main/content.css`

분리 후보:

```text
src/ui/desc-panel.js
src/ui/desc-panel.css
```

검증 하네스:

```text
harness/panel.html
```

패널 상태:

- `idle`
- `loading`
- `success`
- `issue-key-not-found`
- `description-not-found`
- `permission-error`
- `network-error`
- `extension-invalidated`

### 5. i18n resource management

역할:

- 화면에 노출되는 문구를 YAML 원본으로 관리한다.
- content script, panel UI, Objectives injection UI, harness에서 같은 메시지 키를 사용한다.
- 초기 기본 언어는 한국어로 둔다.
- 나중에 영어를 추가할 수 있도록 locale 파일 구조를 먼저 잡는다.

권장 방식:

- 개발자가 직접 수정하는 원본은 `src/i18n/{locale}.yml`이다.
- 빌드 시 런타임 UI용 `dist/i18n/{locale}.json`을 생성한다.
- 빌드 시 Chrome Extension manifest 문구용 `_locales/{locale}/messages.json`을 생성한다.
- 하네스는 Chrome i18n API 없이도 동작해야 하므로 YAML 원본 또는 생성된 runtime JSON을 로드할 수 있게 설계한다.

분리 후보:

```text
src/i18n/ko.yml
src/i18n/en.yml
src/i18n/i18n.js
scripts/build-i18n.js
_locales/ko/messages.json
_locales/en/messages.json
```

메시지 키 예시:

```yml
extension:
  name: fishhook
  description: Fisheye에서 Jira 내용을 보여줍니다.

panel:
  title: Jira 내용
  loading: Jira 내용을 불러오는 중입니다.
  close: 닫기
  refresh: 새로고침

objectives:
  banner: Jira 내용 미리보기
  restore: 원래 내용

error:
  issueKeyNotFound: Fisheye 화면에서 Jira 이슈 키를 찾지 못했습니다.
  descriptionNotFound: Jira 내용이 비어 있거나 가져오지 못했습니다.
  permissionRequired: Jira/Fisheye 사이트 접근 권한이 필요합니다.
```

검증 하네스:

```text
harness/i18n.html
```

i18n 완료 기준:

- UI 코드에 사용자 노출 문구가 하드코딩되지 않는다.
- 누락된 메시지 키는 개발 중 눈에 띄는 fallback으로 표시된다.
- 한국어 YAML 원본으로 panel/objectives harness가 정상 표시된다.
- 빌드 산출물로 runtime JSON과 Chrome `_locales` JSON이 생성된다.
- Chrome `_locales`와 runtime i18n의 역할이 섞이지 않는다.

## 권한 설계

현재 `manifest.json`은 아래 형태다.

```json
{
  "host_permissions": ["http://*/*", "https://*/*"]
}
```

Jira REST API와 첨부파일 fetch 모두 extension host permission과 브라우저 Jira 로그인 세션에 의존한다.
하네스 단계에서는 mock 응답으로 fetch·렌더 파이프라인을 검증할 수 있다.

## 메시지 네이밍

기존 프로젝트의 `JIRA_WIKI_*` 메시지는 사용하지 않는다.
`fishhook`에서는 기능 이름과 일치하는 메시지명을 사용한다.

예상 메시지:

```text
FISHHOOK_SHOW_JIRA_PANEL
FISHHOOK_FETCH_JIRA_CONTENT
FISHHOOK_REFRESH_JIRA_PANEL
FISHHOOK_CLOSE_JIRA_PANEL
```

## 권장 디렉터리 구조

```text
fishHook/
  manifest.json
  icons/
    icon512.png

  docs/
    harness-engineering-plan.md
    jira-media-handling.md
    objectives-icon-button-design.md

  src/
    fisheye/
      issue-key.js
      content.js
      objectives-target.js
    jira/
      fetch-description.js
    i18n/
      ko.yml
      en.yml
      i18n.js
    ui/
      desc-panel.js
      desc-panel.css
      objectives-injection.js
      objectives-injection.css
    extension/
      background.js
      messages.js

  _locales/
    ko/
      messages.json
    en/
      messages.json

  scripts/
    build-i18n.js

  harness/
    fixtures/
      fisheye-review-basic.html
      fisheye-review-title-link.html
      fisheye-review-no-key.html
      fisheye-objectives-basic.html
      fisheye-objectives-missing.html
    key-extract.html
    objectives-injection.html
    panel.html
    jira-fetch-mock.html
    i18n.html
```

## 구현 순서

### Phase 1. Issue key extraction harness

목표:

- Fisheye DOM에서 Jira key를 안정적으로 찾는 순수 함수를 만든다.
- fixture HTML 기반으로 브라우저에서 결과를 확인한다.

완료 기준:

- 제목 첫머리 key 추출 성공
- 링크 href의 `/browse/KEY-123` 추출 성공
- query string의 `?key=KEY-123` 추출 성공
- `RGS-1234` 제외 성공
- key 없음 상태 반환 성공

### Phase 2. Objectives injection harness

목표:

- Fisheye Objectives 영역에 Jira 내용을 붙여 넣는 UI를 독립적으로 검증한다.
- 기존 Objectives 내용을 저장하지 않고 DOM 안에서만 교체한다.

완료 기준:

- Objectives target 탐색 성공
- target이 없을 때 오류 상태 표시
- Jira 내용 주입 성공
- 원래 Objectives 내용 복원 성공
- 긴 본문, 표, 코드 블록 표시 확인
- 주입된 내용이 preview임을 명확히 표시

### Phase 3. Panel UI harness

목표:

- Jira 데이터 없이도 우측 하단 패널 UI를 독립적으로 볼 수 있게 한다.
- mock data로 상태별 화면을 검증한다.

완료 기준:

- 로딩 상태 표시
- 성공 상태 표시
- 에러 상태 표시
- 긴 본문 스크롤 처리
- 닫기 버튼 동작
- 작은 화면에서 패널이 viewport를 넘지 않음

### Phase 4. i18n harness

목표:

- UI 문구를 YAML locale 원본에서 가져오도록 검증한다.
- Chrome Extension API 없이도 하네스에서 같은 메시지 키를 사용할 수 있게 한다.

완료 기준:

- 한국어 YAML 로딩
- 영어 YAML 로딩
- runtime JSON 생성
- Chrome `_locales` messages.json 생성
- 누락 키 fallback 표시
- panel/objectives 하네스에서 같은 i18n helper 사용

### Phase 5. Background fetch harness

목표:

- Jira 내용 fetch 로직을 background handler와 분리한다.
- mock fetch로 성공/실패 케이스를 검증한다.

완료 기준:

- Jira API 성공 응답 파싱
- rendered description 파싱
- ADF description fallback 파싱
- ADF media + attachment 매칭
- `includeVideo: false` 시 `[VIDEO]` placeholder 생성
- HTTP 에러 상태 반환
- Description 없음 상태 반환

### Phase 6. Extension integration

목표:

- content script, background script, Objectives injection UI, panel UI를 실제 메시지로 연결한다.
- 권한 정책을 확정한 뒤 실제 Jira/Fisheye 사이트에서 수동 검증한다.

완료 기준:

- Fisheye 페이지에서 Jira issue key 자동 추출
- Jira 내용 로딩
- Jira 내용을 Objectives 영역에 표시 (동영상 재생 포함)
- Jira 내용을 우측 하단 패널에 표시 (동영상은 `[VIDEO]`)
- 실패 시 사용자가 이해할 수 있는 메시지 표시

## 초기 개발 원칙

- 먼저 순수 함수와 DOM fixture를 만든다.
- Chrome Extension API 의존성은 얇은 adapter에만 둔다.
- Jira fetch, Objectives injection, panel rendering을 섞지 않는다.
- 사용자 노출 문구는 i18n YAML 원본을 통해 관리한다.
- 하네스 HTML은 빌드 도구 없이 브라우저에서 바로 열 수 있게 유지한다.
- 기존 프로젝트 코드를 가져오더라도 `JIRA_WIKI_*` 네이밍은 `FISHHOOK_*`로 바꾼다.
- 보안 기본값은 host permission 없음으로 유지한다.

## 다음 작업

가장 먼저 만들 파일은 다음 세 개다.

```text
src/fisheye/issue-key.js
harness/key-extract.html
src/i18n/ko.yml
```

이 파일들이 준비되면 실제 Fisheye 연동 없이도 핵심 입력인 Jira issue key 추출 품질을 빠르게 확인하고, 이후 UI 하네스가 사용할 기본 문구 체계를 같이 시작할 수 있다.
