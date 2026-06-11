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

초기 환경설정 페이지는 아래 요소만 포함한다.

- Jira 경로 입력 창
- Fisheye 경로 입력 창
- 아래쪽 별도 카드의 언어 선택
- 이벤트 토스트

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

## 권한 처리 방향

현재 `manifest.json`의 `host_permissions`는 빈 배열로 둔다.

환경설정 페이지에서 Jira/Fisheye 경로를 저장할 때 바로 host permission을 요청할지, 실제 기능 실행 시 요청할지는 별도 결정이 필요하다.

초기 권장 방향:

- 환경설정 저장은 단순히 URL만 저장한다.
- 실제 Jira 내용 가져오기 또는 Fisheye 페이지 주입 시점에 필요한 권한을 요청한다.
- 권한이 없으면 사용자에게 토스트 또는 패널 오류로 안내한다.

이 방식은 사용자가 설정만 둘러볼 때 불필요한 권한 요청을 받지 않게 한다.

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

환경설정 페이지의 문구도 i18n YAML 원본에서 관리한다.

키 후보:

```yml
options:
  title: 환경설정
  description: Fisheye에서 Jira 내용을 보여주기 위한 기본 경로를 설정합니다.
  language:
    label: 언어
    auto: 브라우저 기본값
    en: 영어
    ko: 한국어
  jiraUrl:
    label: Jira 경로
    placeholder: https://jira.<domain>.com
  fisheyeUrl:
    label: Fisheye 경로
    placeholder: https://fisheye.<domain>.com
  save: 저장

toast:
  saved: 저장했습니다.
  languageChanged: 언어를 변경했습니다.
  invalidJiraUrl: Jira 경로를 확인해 주세요.
  invalidFisheyeUrl: Fisheye 경로를 확인해 주세요.
  loadFailed: 설정을 불러오지 못했습니다.
  saveFailed: 설정을 저장하지 못했습니다.
```

## 구현 파일 후보

```text
options/
  options.html
  options.js
  options.css
popup/
  popup.html
  popup.js
  popup.css
src/settings/storage.js
src/settings/url-normalize.js
src/ui/toast.js
```

초기에는 빌드 도구 없이 일반 JavaScript로 구현한다.

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
- 사용자 노출 문구는 i18n YAML 설계에 맞춰 분리 가능해야 한다.
