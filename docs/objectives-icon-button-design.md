# fishhook Objectives Icon Button Design

## 목적

Fisheye 리뷰 화면의 `Objectives` 라벨 우측에 FishHook 아이콘 버튼을 추가한다.
기존 `jira-preview-main`에서는 `내용 불러오기` 텍스트 버튼을 붙였지만, `fishhook`에서는 텍스트 대신 작은 아이콘 버튼으로 제공한다.

버튼의 역할은 Fisheye 화면에서 찾은 Jira 내용을 Objectives 영역에 임시로 붙여 넣어 보여주는 것이다.

## 기준 동작

```text
Fisheye review page
  -> 저장된 Fisheye 경로 확인
  -> 현재 페이지가 저장된 Fisheye origin과 일치하는지 확인
  -> Objectives heading 탐색
  -> Objectives 라벨 우측에 icon button 추가
  -> icon button 클릭
  -> Jira issue key 추출
  -> Jira URL 설정 확인
  -> Jira 로그인 상태 확인
  -> Jira 내용 가져오기
  -> Objectives 영역에 Jira 내용 임시 표시
```

주입된 내용은 Fisheye 서버에 저장하지 않는다.
페이지 새로고침 또는 원래 내용 복원 시 기존 Objectives 내용으로 돌아간다.

저장된 Fisheye 경로가 없거나 현재 페이지가 저장된 Fisheye 경로와 다르면 아무 동작도 하지 않는다.
Jira 경로가 없으면 Objectives 삽입을 시도하지 않고 우측 하단 오류 팝업을 표시한다.
Jira에 로그인되어 있지 않으면 Objectives 삽입을 시도하지 않고 우측 하단 오류 팝업을 표시한다.

## 기존 프로젝트 참고

기존 `jira-preview-main`에서는 아래 흐름을 참고한다.

```text
fisheye-content.js
  findObjectivesHeading()
  injectObjectivesLoadButton()
  openDescriptionOverviewPreview()
  showOverviewContent()
  restoreOverviewBody()
```

기존 텍스트 버튼:

```text
내용 불러오기
```

FishHook 신규 버튼:

```text
[icon]
```

## 버튼 위치

버튼은 Objectives heading 내부에서 라벨 오른쪽에 배치한다.

예상 구조:

```text
Objectives [edit] [FishHook icon button]
```

Fisheye DOM 구조가 버전이나 화면 상태에 따라 다를 수 있으므로 다음 순서로 target을 찾는다.

1. `h4.overview-heading` 중 텍스트가 `Objectives`로 시작하는 heading
2. heading 주변에 `#objectives-markup`이 있는 heading
3. `a.edit-objectives`가 포함된 overview heading

저장된 Fisheye 경로와 현재 페이지가 일치하지만 Objectives heading/area를 찾지 못하면 console에 진단 로그를 남긴다.
저장된 Fisheye 경로가 없거나 다른 사이트에서는 로그를 남기지 않는다.

## 버튼 UI

버튼은 텍스트 없이 아이콘만 보여준다.
아이콘은 FishHook 확장 아이콘을 그대로 크게 넣지 않고, 작은 기능 아이콘처럼 보이게 한다.

권장 마크업:

```html
<button
  class="fishhook-objectives-button"
  type="button"
  aria-label="Jira 내용 불러오기"
  title="Jira 내용을 Objectives에 표시"
>
  <span class="fishhook-objectives-button__icon" aria-hidden="true"></span>
</button>
```

아이콘 구현 후보:

- CSS mask로 기존 `icons/icon512.png` 사용
- 아이콘 로드에 실패하면 기존처럼 `내용 불러오기` 텍스트 표시

초기 구현은 기존 확장 아이콘을 CSS mask로 사용한다.
mask 방식은 hover 시 아이콘 색상만 바꿀 수 있어, 버튼 배경이나 테두리를 추가하지 않아도 된다.

## 상태

버튼 상태:

```text
idle
busy
error
disabled
```

상태별 동작:

- `idle`: 클릭 가능
- `busy`: Jira 내용을 불러오는 중, 중복 클릭 방지
- `error`: 오류 토스트 표시 후 idle로 복귀
- `disabled`: Objectives target이 없거나 extension context가 유효하지 않음

busy 상태:

```html
aria-busy="true"
disabled
```

시각 표현:

- 아이콘 opacity 낮춤
- 작은 spinner 또는 회전 애니메이션 적용 가능
- 버튼 크기는 변하지 않아야 함

## 클릭 동작

클릭 시 순서:

```text
1. 기본 이벤트 차단
2. 이미 busy면 return
3. 버튼 busy 상태로 전환
4. 기존 우측 하단 패널이 있으면 닫기
5. 기존 Objectives injection이 있으면 원본 복원
6. Jira issue key 추출
7. Jira URL 설정 확인
8. Objectives 영역에 loading 상태 표시
9. background에 Jira 내용 fetch 요청
10. Jira 로그인/권한 상태 확인
11. Objectives 영역에 결과 표시
12. 버튼 idle 상태로 복귀
```

오류 시:

- Jira issue key를 찾지 못하면 토스트 표시
- Objectives 영역을 찾지 못하면 토스트 표시
- Jira URL이 설정되지 않았으면 우측 하단 오류 팝업 표시
- Jira에 로그인되어 있지 않으면 우측 하단 오류 팝업 표시
- Jira fetch 실패 시 우측 하단 오류 팝업 표시
- 버튼은 항상 idle 상태로 복귀

Jira 로그인 실패 문구:

```text
Jira에 로그인되어 있지 않습니다. Jira에 먼저 로그인한 뒤 다시 시도해 주세요.
```

## i18n

문구는 `src/i18n/{locale}.yml`에서 관리한다.

키 후보:

```yml
objectives:
  loadAriaLabel: Jira 내용 불러오기
  loadTitle: Jira 내용을 Objectives에 표시
  loading: Jira 내용을 불러오는 중입니다.
  restore: 원래 내용
  previewBanner: Jira 내용 미리보기
  openJira: Jira 열기
  jiraUrlRequired: Jira 경로가 설정되어 있지 않습니다. 환경설정에서 Jira 경로를 먼저 입력해 주세요.
  loginRequired: Jira에 로그인되어 있지 않습니다. Jira에 먼저 로그인한 뒤 다시 시도해 주세요.
  issueKeyNotFound: Fisheye 화면에서 Jira 이슈 키를 찾지 못했습니다.
  targetNotFound: Objectives 영역을 찾지 못했습니다.
  loadFailed: Jira 내용을 불러오지 못했습니다.
```

영어:

```yml
objectives:
  loadAriaLabel: Load Jira content
  loadTitle: Show Jira content in Objectives
  loading: Loading Jira content.
  restore: Restore original content
  previewBanner: Jira content preview
  openJira: Open Jira
  jiraUrlRequired: The Jira URL is not set. Add the Jira URL in settings first.
  loginRequired: You are not logged in to Jira. Log in to Jira first, then try again.
  issueKeyNotFound: Could not find a Jira issue key on this Fisheye page.
  targetNotFound: Could not find the Objectives area.
  loadFailed: Could not load Jira content.
```

## 권한 방향

현재 `manifest.json`의 `host_permissions`는 빈 배열이다.
따라서 Objectives 버튼 주입은 아래 둘 중 하나로 구현한다.

### 방식 A. popup 실행 시점 주입

```text
popup click
  -> 현재 탭 URL 확인
  -> Fisheye URL이면 필요한 권한 요청
  -> content script 주입
  -> Objectives 버튼 추가
  -> 버튼 클릭 시 background에서 Jira API fetch
```

장점:

- 기본 권한을 넓히지 않는다.
- 사용자가 명시적으로 실행할 때만 접근한다.

단점:

- 페이지 진입 시 자동으로 버튼이 보이지 않는다.

### 방식 B. 저장된 Fisheye 경로 기반 runtime permission

```text
options에서 Fisheye URL 저장
  -> 기능 실행 시 runtime permission 요청
  -> 승인된 origin에서 content script 등록 또는 주입
```

장점:

- 사용자가 허용한 사이트에서 자연스럽게 동작 가능하다.

단점:

- 권한 요청 UX 설계가 필요하다.

초기 구현은 방식 A를 우선한다.

Jira fetch는 background service worker에서 수행한다.
content script는 `FISHHOOK_FETCH_JIRA_CONTENT` 메시지로 issue key를 전달하고, background는 저장된 Jira URL로 Jira REST API를 호출한다.
Jira API 응답이 `401`, `403`, 또는 JSON이 아닌 로그인 HTML이면 `JIRA_LOGIN_REQUIRED`로 간주한다.

## 활성화 조건

Objectives 아이콘 버튼은 환경설정에 저장된 Fisheye 경로에서만 활성화된다.

조건:

```text
saved fishhook.fisheyeBaseUrl exists
current window.location.origin === saved Fisheye origin
```

예:

```text
saved: https://fisheye.<domain>.com
current: https://fisheye.<domain>.com/cru/...
-> active

saved: https://fisheye.<domain>.com
current: https://jira.<domain>.com/browse/KEY-123
-> inactive
```

비활성 조건:

- Fisheye 경로가 저장되지 않음
- 현재 페이지가 저장된 Fisheye origin과 다름
- Chrome storage를 읽을 수 없음
- Jira 경로가 저장되지 않은 상태에서는 버튼 클릭 시 우측 하단 오류 팝업만 표시

정의된 Fisheye 페이지에서 Objectives를 못 찾는 경우:

```text
console.info("[fishhook][fisheye]", "Configured Fisheye page matched, but the Objectives heading/area was not found.", ...)
```

## 구현 파일 후보

```text
content/
  description-renderer.js
  fisheye-content.js
  fisheye-content.css

src/fisheye/
  issue-key.js
  objectives-target.js
  objectives-button.js
  objectives-injection.js

src/ui/
  toast.js
```

현재 프로젝트가 빌드 도구 없는 일반 JavaScript 구조이므로 초기에는 `content/` 아래에 content script 파일을 두는 방식을 우선 고려한다.

```text
content/description-renderer.js
content/fisheye-content.js
content/fisheye-content.css
```

`description-renderer.js`는 Jira HTML 후처리를 담당한다.
`fisheye-content.js`는 issue key 추출, Jira fetch 요청, Objectives 삽입만 담당한다.

후처리 범위:

- Jira rendered description HTML sanitize
- 코드 블록을 Fisheye 스타일 code panel로 변환
- inline code 보정
- table에 `wiki-table` 스타일 적용
- blob 이미지/media placeholder 처리
- list/table/code block이 Fisheye CSS에 의해 숨겨지지 않도록 class와 CSS 보정

## 하네스

실제 Fisheye 없이 버튼 위치와 동작을 확인하기 위해 fixture 기반 하네스를 만든다.

파일 후보:

```text
harness/objectives-button.html
harness/fixtures/fisheye-objectives-heading.html
harness/fixtures/fisheye-objectives-with-edit-link.html
harness/fixtures/fisheye-objectives-missing.html
```

검증 항목:

- Objectives heading 오른쪽에 아이콘 버튼이 붙는다.
- 기존 edit link가 있으면 edit link 오른쪽에 붙는다.
- 버튼이 중복 삽입되지 않는다.
- Objectives heading이 없으면 아무것도 삽입하지 않는다.
- 클릭 시 busy 상태가 표시된다.
- 오류 시 토스트가 표시된다.

## CSS 원칙

- 버튼 크기는 Fisheye heading 높이에 맞춘다.
- 주변 Fisheye edit link와 시각적으로 충돌하지 않는다.
- 텍스트가 없으므로 `aria-label`과 `title`은 필수다.
- 기본 상태에서는 테두리와 배경을 표시하지 않는다.
- hover 상태에서는 아이콘 색상만 primary 색상으로 바꾼다.
- focus 상태는 접근성을 위해 outline만 표시한다.
- 버튼 삽입으로 heading 줄높이가 흔들리지 않아야 한다.

예상 스타일:

```css
.fishhook-objectives-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #5e6c84;
  cursor: pointer;
}

.fishhook-objectives-button:hover {
  color: rgb(120, 182, 0);
}

.fishhook-objectives-button:focus-visible {
  outline: 2px solid rgba(120, 182, 0, 0.45);
  outline-offset: 2px;
}
```

## 완료 기준

- Fisheye Objectives 라벨 우측에 FishHook 아이콘 버튼이 표시된다.
- 버튼은 환경설정에 저장된 Fisheye 경로와 현재 페이지 origin이 일치할 때만 표시된다.
- 저장된 Fisheye 경로가 없거나 다른 페이지에서는 동작하지 않는다.
- 정의된 Fisheye 페이지에서 Objectives를 못 찾으면 console에 진단 로그가 남는다.
- 버튼 텍스트 `내용 불러오기`는 화면에 노출되지 않는다.
- 아이콘을 찾지 못하면 `내용 불러오기` 텍스트로 fallback된다.
- 기본 버튼에는 테두리와 배경이 없다.
- hover 시 아이콘 색상만 변경된다.
- 버튼에는 `aria-label`과 `title`이 있다.
- 버튼 클릭 시 Jira 내용 로딩이 시작된다.
- 로딩 중 중복 클릭이 방지된다.
- Jira URL이 없으면 우측 하단 오류 팝업이 표시된다.
- Jira에 로그인되어 있지 않으면 우측 하단 오류 팝업이 표시된다.
- Jira에 로그인되어 있는 경우에만 Objectives에 내용이 붙여 넣어진다.
- 실패 시 토스트 또는 Objectives 영역에 오류가 표시된다.
- 기존 Objectives 내용을 복원할 수 있다.
- i18n YAML에 한국어/영어 문구가 준비된다.
