# fishhook Options Page Design

## 목적

`fishhook`의 환경설정 페이지는 확장 프로그램이 접근할 Jira/Fisheye 경로를 사용자가 직접 지정하는 곳이다.
초기 버전에서는 설정 항목을 최소화하고, 사용자가 헷갈리지 않게 두 개의 경로만 관리한다.

## 진입 방식

Chrome Extension toolbar의 `fishhook` 버튼을 누르면 작은 메뉴를 표시한다.

메뉴에는 환경설정으로 이동하는 항목을 둔다.

```text
fishhook toolbar button
  -> popup menu
  -> 환경설정
  -> options page
```

초기 popup menu는 기능을 많이 넣지 않는다.

예상 메뉴:

```text
[icon]

[환경설정]
```

추후 기능이 연결되면 아래 항목을 추가할 수 있다.

```text
[현재 페이지에서 Jira 내용 표시]
[환경설정]
```

## 환경설정 페이지 범위

환경설정 페이지는 아래 요소를 포함한다.

- Jira 경로 입력 창
- Fisheye 경로 입력 창
- Objectives 버튼 표시 토글 (별도 카드)
- Description 미리보기 FAB 표시 토글 (별도 카드)
- 언어 선택 (별도 카드)
- 이벤트 토스트

토글은 저장 버튼과 무관하게 **변경 즉시 저장**되고 토스트로 알린다.

## 설정 항목

### 언어

역할:

- popup과 options page에 표시할 언어를 저장한다.
- 지원 언어는 영어와 한국어만 둔다.

선택값:

```text
브라우저 기본값
English
한국어
```

기본 동작:

- 저장된 언어가 없으면 브라우저 기본값을 따른다.
- 브라우저 언어가 영어 또는 한국어이면 해당 언어를 사용한다.
- 브라우저 언어가 영어/한국어가 아니면 영어를 사용한다.

저장 키 후보:

```text
fishhook.language
```

### Jira 경로

역할:

- Jira 이슈 내용을 가져올 기준 경로를 저장한다.
- 한 번에 하나의 Jira 경로만 저장할 수 있다.

예상 입력:

```text
https://jira.<domain>.com
https://<domain>.atlassian.net
```

저장 시 정규화:

- 앞뒤 공백 제거
- 마지막 `/` 제거
- scheme이 없으면 `https://` 보정

예:

```text
jira.<domain>.com/
-> https://jira.<domain>.com
```

검증:

- 빈 값은 저장하지 않는다.
- `http://` 또는 `https://` URL만 허용한다.
- host가 없는 URL은 거부한다.
- 일반 도메인은 `.`을 포함해야 한다.
- 로컬 개발을 위해 `localhost`는 허용한다.
- 저장 시 path, query, hash는 제거하고 origin만 저장한다.

저장 키 후보:

```text
fishhook.jiraBaseUrl
```

### Fisheye 경로

역할:

- fishhook이 동작할 Fisheye 기준 경로를 저장한다.
- 한 번에 하나의 Fisheye 경로만 저장할 수 있다.

예상 입력:

```text
https://fisheye.<domain>.com
```

저장 시 정규화:

- 앞뒤 공백 제거
- 마지막 `/` 제거
- scheme이 없으면 `https://` 보정

검증:

- 빈 값은 저장하지 않는다.
- `http://` 또는 `https://` URL만 허용한다.
- host가 없는 URL은 거부한다.
- 일반 도메인은 `.`을 포함해야 한다.
- 로컬 개발을 위해 `localhost`는 허용한다.
- 저장 시 path, query, hash는 제거하고 origin만 저장한다.

저장 키 후보:

```text
fishhook.fisheyeBaseUrl
```

### Objectives 버튼 표시

역할:

- Fisheye Objectives 라벨 우측 아이콘 버튼을 표시할지 정한다.
- 기본값은 **켬**이다.

저장 키:

```text
fishhook.showObjectivesButton
```

변경 즉시 저장하고, 열려 있는 Fisheye 탭의 content script가 버튼을 추가/제거한다.

### Description 미리보기 버튼(FAB) 표시

역할:

- Fisheye 우측 하단 플로팅 버튼(📖)을 표시할지 정한다.
- 기본값은 **끔**이다. 꺼도 툴바 팝업으로는 미리보기를 열 수 있다.

저장 키:

```text
fishhook.showDescriptionPanelFab
```

### 패널 크기 (사용자 조작으로 자동 저장)

미리보기 패널을 리사이즈하면 크기가 저장되어 다음에 복원된다. 환경설정 페이지에는
노출하지 않는다.

```text
fishhook.descPanelSize
```

## 권한 처리

현재 `manifest.json`은 아래 host permission을 설치 시점에 요청한다.

```json
{
  "host_permissions": ["http://*/*", "https://*/*"]
}
```

Jira/Fisheye origin을 사용자가 임의로 지정하므로 설치 시점에 대상 호스트를 알 수 없어
넓은 권한을 쓴다. 대신 실제 동작은 저장된 origin으로 제한한다.

- 환경설정 저장은 URL만 저장한다. 별도 권한 요청은 하지 않는다.
- content script는 저장된 Fisheye origin과 현재 origin이 일치할 때만 UI를 삽입한다.
- background의 첨부파일 fetch는 저장된 Jira 호스트의 attachment 경로만 허용한다.
- Jira URL이 없거나 로그인되어 있지 않으면 우측 하단 오류 패널로 안내한다.

## 이벤트 토스트

환경설정 페이지의 주요 피드백은 이벤트 토스트로 보여준다.
URL 검증 오류는 사용자가 바로 고칠 수 있도록 입력창 아래에도 표시한다.

토스트 위치:

```text
우측 하단
```

토스트 종류:

- success
- error
- info

토스트 예시:

```text
저장했습니다.
언어를 변경했습니다.
Jira 경로를 확인해 주세요.
Fisheye 경로를 확인해 주세요.
설정을 불러오지 못했습니다.
```

동작:

- 3초 후 자동 닫힘
- 새 토스트가 오면 기존 토스트 교체
- 사용자가 닫기 버튼으로 즉시 닫을 수 있음
- 오류 토스트는 success보다 조금 더 오래 표시할 수 있음

## 레이아웃

페이지는 설정 도구처럼 조용하고 명확하게 구성한다.
마케팅형 랜딩 페이지처럼 만들지 않는다.

구조:

```text
Header
  fishhook

Main
  Fisheye에서 Jira 내용을 보여주기 위한 기본 경로를 설정합니다.

  Jira 경로
    [ input ]
    [ validation message ]

  Fisheye 경로
    [ input ]
    [ validation message ]

  [저장]

Objectives button card
  Objectives 버튼
    [ checkbox ] Fisheye Objectives 옆에 Jira 불러오기 버튼 표시

Description preview card
  Description 미리보기 버튼
    [ checkbox ] Fisheye 우하단에 Description 미리보기 버튼(📖) 표시

Language card
  언어
    [ select ]

Toast
```

## UI 원칙

- 입력창은 한 줄 URL 입력에 집중한다.
- 카드 안에 카드를 중첩하지 않는다.
- 설정 항목은 과하게 꾸미지 않고 읽기 쉽게 배치한다.
- 버튼은 명확한 primary action 하나만 둔다.
- 저장 전 변경 여부를 감지해 저장 버튼 상태를 조정할 수 있다.
- 모바일 폭에서도 입력창과 버튼이 겹치지 않아야 한다.

## 상태

환경설정 페이지는 다음 상태를 가진다.

```text
loading
ready
dirty
saving
saved
validation-error
storage-error
```

상태별 기대 동작:

- `loading`: 저장된 값을 불러오는 중이다.
- `ready`: 저장된 값이 입력창에 표시된 상태다.
- `dirty`: 사용자가 값을 변경했다.
- `saving`: 저장 버튼을 비활성화하고 저장 중임을 표시한다.
- `saved`: 저장 완료 토스트를 표시한다.
- `validation-error`: 잘못된 URL 입력을 필드 메시지와 토스트로 안내한다.
- `storage-error`: Chrome storage 오류를 토스트로 안내한다.

## i18n

문구는 `data-i18n` / `data-i18n-placeholder` 속성으로 표시하고, 실제 문자열은
`src/i18n/i18n.js`의 인라인 메시지 객체에서 온다. `src/i18n/{ko,en}.yml`은
참조용 사본이라 **yml만 고치면 화면이 바뀌지 않는다** (AGENTS.md 참고).

사용 중인 키:

```text
options.title, options.eyebrow, options.description, options.save
options.jiraUrl.{label,placeholder,invalid}
options.fisheyeUrl.{label,placeholder,invalid}
options.objectivesButton.{label,enable}
options.descPanelFab.{label,enable}
options.language.{label,auto,en,ko}

toast.saved, toast.languageChanged, toast.loadFailed, toast.saveFailed
toast.invalidJiraUrl, toast.invalidFisheyeUrl
toast.objectivesButton{Enabled,Disabled}
toast.descPanelFab{Enabled,Disabled}
```

## 구현 파일

```text
options/options.html   # 폼, 토글 카드, 언어 카드, 토스트 루트
options/options.js     # 로드/검증/저장, 토글 즉시 저장, i18n 적용
options/options.css
popup/popup.html       # 툴바 팝업 (미리보기 열기 / 환경설정 열기)
popup/popup.js
popup/popup.css
src/i18n/i18n.js       # 언어 결정 + 메시지
```

빌드 도구 없는 일반 JavaScript다. URL 정규화·검증과 토스트는 별도 모듈 없이
`options.js` 안에 있다.

## 완료 기준

- Extension toolbar 버튼을 누르면 환경설정 메뉴가 보인다.
- 메뉴에서 환경설정 페이지를 열 수 있다.
- 브라우저 언어가 영어/한국어이면 해당 언어로 기본 표시된다.
- 브라우저 언어가 영어/한국어가 아니면 영어로 표시된다.
- 환경설정에서 영어/한국어/브라우저 기본값을 선택할 수 있다.
- 언어를 변경하면 즉시 저장되고 변경 완료 토스트가 표시된다.
- Jira 경로를 하나만 입력하고 저장할 수 있다.
- Fisheye 경로를 하나만 입력하고 저장할 수 있다.
- 잘못된 URL 입력 시 필드 오류와 토스트가 표시된다.
- 저장 성공 시 토스트가 표시된다.
- 새로고침 후 저장된 값이 다시 표시된다.
- Objectives 버튼 / 미리보기 FAB 토글이 즉시 저장되고 토스트가 표시된다.
- 사용자 노출 문구가 코드에 하드코딩되지 않고 i18n 키로 표시된다.

## 수동 검증 체크리스트

- [ ] 툴바 아이콘 → 팝업 → 환경설정 페이지 열림
- [ ] Jira/Fisheye 경로 저장 후 새로고침 → 값 유지
- [ ] `jira.example.com/` 입력 → `https://jira.example.com`으로 정규화 저장
- [ ] 잘못된 URL(`ftp://`, host 없음, `.` 없는 도메인) → 필드 오류 + 토스트, 저장 안 됨
- [ ] `localhost` 입력 → 허용
- [ ] 언어를 한국어/영어로 변경 → 페이지 문구 즉시 변경 + 토스트
- [ ] Objectives 버튼 토글 끔 → 열려 있는 Fisheye 탭에서 아이콘 버튼 사라짐
- [ ] 미리보기 FAB 토글 켬 → Fisheye 우하단에 📖 버튼 표시
- [ ] FAB 꺼진 상태에서도 툴바 팝업으로 미리보기 열림
