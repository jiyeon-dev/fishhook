# Jira 미디어(이미지·동영상) 처리

## 목적

Jira Description에 포함된 인라인 첨부파일(이미지, 동영상)을 Fisheye에서 보여줄 때 발생하는 문제를 해결한다.

Jira REST API의 `expand=renderedFields` 응답은 미디어를 제대로 HTML로 변환하지 못하는 경우가 많다.

```html
<!-- 미디어 참조 해석 실패 -->
<span class="error">[^524f6d51-e4fb-475b-9122-24e283d1a95f]</span>

<!-- 매크로·위키 마크업 등 다른 렌더 실패 (미디어 아님) -->
<span class="error">[snmp0-]</span>
```

미디어 오류 span은 본문에 `^`와 UUID(또는 media id)가 포함된다.
`[snmp0-]`처럼 대괄호만 있는 일반 텍스트는 미디어가 아니므로 placeholder로 바꾸지 않고 원문 그대로 표시한다.

또한 첨부파일 URL이 `/rest/api/3/attachment/content/123` 같은 상대 경로이고, Fisheye 페이지에서는 Jira 도메인과 origin이 달라 **동영상**은 content script에서 직접 fetch할 수 없다(CORS). **이미지**는 `<img src>`로 Jira 절대 URL을 바로 넣어 브라우저가 로드한다.

## 표시 위치별 동작

| 표시 위치 | 이미지 | 동영상 |
|-----------|--------|--------|
| Objectives 불러오기 | `<img src>`로 Jira URL 직접 표시 · **클릭 시 전체화면** | background fetch → blob URL 재생 |
| Description 미리보기 패널 | `<img src>`로 Jira URL 직접 표시 · **클릭 시 전체화면** | **`[VIDEO]`** 플레이스홀더만 표시 |
| Jira에서 blob URL 이미지 | `[image: 파일명]` 플레이스홀더 | — |
| 외부 embed (iframe) | 표시하지 않음 | 표시하지 않음 |

미리보기 패널에서는 동영상 스트리밍·레이아웃 이슈를 피하기 위해 재생하지 않는다.
Objectives 영역에서만 동영상을 재생한다.
이미지는 Objectives·미리보기 패널 모두에서 클릭하면 전체화면(라이트박스)으로 확대할 수 있다.

## 처리 흐름

```text
background.js
  -> Jira REST API (fields=summary,description,attachment, expand=renderedFields)
  -> ADF media 노드 + 첨부파일 목록 매칭
  -> rendered HTML의 error span / 상대 URL 보정
  -> includeVideo 옵션에 따라 동영상 태그 또는 [VIDEO] placeholder 생성
  -> 이미지 <img>에는 src + data-fishhook-media-url 모두 설정

content/description-renderer.js
  -> sanitize, code block 변환, table/inline code 보정
  -> videoMode=placeholder 이면 남은 <video>를 [VIDEO]로 교체
  -> src가 있는 <img>에는 loading shimmer를 붙이지 않음

content/media-loader.js
  -> src가 없는 [data-fishhook-media-url] 요소만 hydration (실질적으로 <video>)
  -> content script → background (FISHHOOK_FETCH_JIRA_ATTACHMENT)
  -> blob URL 생성 후 video.src에 설정

content/image-lightbox.js
  -> Objectives / 미리보기 패널 안의 <img> 클릭 → 전체화면 오버레이
```

## background.js 미디어 해석

### Jira API 요청

```text
GET {jiraBaseUrl}/rest/api/{3|2|latest}/issue/{KEY}
  ?fields=summary,description,attachment
  &expand=renderedFields
```

### ADF media 노드 매칭

`fields.description`(ADF)에서 `media` 노드를 순회하고, `fields.attachment` 목록과 아래 순서로 매칭한다.

1. `collection === 'attachment'` 이고 `id`가 첨부파일 ID와 일치
2. `attrs.url`에 포함된 attachment content ID
3. 첨부파일 `filename`에 media UUID가 포함 (아래 참고)
4. `attrs.alt`와 첨부파일 `filename` 일치
5. UUID 접미사를 제거한 이름끼리 일치 — **후보가 정확히 1개일 때만**
6. media `id`와 첨부파일 `id` 일치

#### 파일명에 붙는 media UUID

같은 이름의 파일이 여러 번 올라가면 Jira Cloud는 첨부파일을 이렇게 저장한다.

```text
ADF media.attrs.alt : 위협 관리 기본 정보 변경 후.png
첨부파일 filename   : 위협 관리 기본 정보 변경 후 (f059930b-7143-4a16-9043-2866adb7bb60).png
```

괄호 안 UUID는 ADF `media.attrs.id`와 같다. 이름 완전 일치로만 비교하면 매칭에 실패해 `[media: …]` placeholder가 뜬다.

- **3단계**가 UUID 포함 여부로 먼저 잡는다. 접미사는 중복을 구분하려고 붙은 것이므로 이름보다 강한 신호다.
- **5단계**는 `\s*\(<uuid>\)\s*`(확장자 앞) 를 양쪽에서 제거하고 비교한다. 정규화 후 후보가 2개 이상이면 `null`을 반환한다 — "변경 전/변경 후" 표에서 엉뚱한 스크린샷을 보여주는 것보다 placeholder가 낫다.

### HTML 후처리

- `<span class="error">[^uuid]</span>` (`^` + media id 패턴) → 매칭된 첨부파일 MIME에 따라 `<video>`, `<img>`, `<a>` 또는 placeholder
- `^` 패턴이 없는 `<span class="error">`(예: `[snmp0-]`) → 미디어로 취급하지 않음; background·renderer 모두 원문 텍스트 유지
- `/rest/api/.../attachment/content/...` 상대 URL → `{jiraBaseUrl}` 절대 URL
- 기존 `<video>` / `<img>` src → `data-fishhook-media-url` 속성 추가

### 축소 이미지 → 원본 이미지

Jira는 Description 인라인 이미지를 **두 가지 축소 형태**로 내려준다. 둘 다 원본으로 바꾼다.

#### 1. REST 썸네일 URL (위키 마크업 / 구 첨부)

```html
<img src="https://{jira}/rest/api/3/attachment/thumbnail/307961" alt="image (17).png" width="200" height="150">
```

`upgradeThumbnailUrlsInHtml`이 `<img>`마다 다음 순서로 원본 URL을 찾는다.

1. 썸네일 경로의 ID가 `fields.attachment`에 있으면 그 첨부파일의 content URL
2. 없으면 `data-attachment-name` / `alt` / `title` 파일명으로 `findAttachmentByFilename` 매칭 (UUID 접미사 제거 후 후보가 1개일 때만)
3. `fields.attachment` 자체가 없으면 경로의 ID를 그대로 써서 `thumbnail` → `content` 치환 (같은 첨부파일 ID)
4. 첨부파일 목록은 있는데 매칭 실패 → 그대로 둔다 (엉뚱한 이미지보다 안전)

대상 경로: `/rest/api/{3|2|latest}/attachment/thumbnail/{id}`, `/secure/thumbnail(s)/{id}`

치환된 `<img>`는 `srcset`·`width`/`height` 속성·인라인 `width`/`height`/`max-*` 스타일을 제거하고 `fishhook-jira-media fishhook-jira-image` 클래스와 `data-fishhook-media-url`을 붙인다. **속성을 지우지 않으면 src만 원본으로 바뀌고 화면에는 여전히 썸네일 크기로 보인다.**

#### 2. Media Services 카드 (Cloud 에디터)

`renderedFields`는 이미지를 카드 마크업으로 감싼다. 안쪽 `<img>`는 156×125 crop 썸네일이고, wrapper에 `--media-wrapper-width:156px`가 인라인으로 박혀 있다.

```html
<div class="MediaGroup">
  <div data-type="file" data-node-type="media" data-id="{media uuid}" data-file-name="image (17).png"
       data-file-mime-type="image/png">
    <button>Open image (17).png</button>
    <img src="https://media-cdn.atlassian.com/file/{uuid}/image/cdn?...&width=156&height=125&mode=crop">
    <div id="titleBoxWrapper">image (17).png · 10 Jul 2026, 02:41 PM</div>
    <div id="actionsBarWrapper"><button>Download</button></div>
  </div>
</div>
```

`replaceMediaCardsInHtml`이 `data-node-type="media"` 여는 태그를 찾고 `<div>` 깊이를 세어 **카드 블록 전체**(버튼·타이틀 박스·다운로드 바 포함)를 걷어낸 뒤 다음으로 교체한다. service worker에는 DOMParser가 없어 문자열 스캐너로 처리한다.

| 상황 | 결과 |
|------|------|
| 첨부파일 매칭 성공 | `createMediaElementHtml` → error-span 경로와 동일한 `<img src=".../attachment/content/{id}">` |
| 매칭 실패 (이미지) | 카드의 CDN 토큰을 재사용해 `mode=full-fit&width=1600&height=1600`으로 재작성 |
| 매칭 실패 (동영상) | `includeVideo: false` → `[VIDEO]`, 그 외 `[media: 파일명]` |
| `data-id` 없음 | 카드 유지 |

매칭 키는 ADF `media` 노드(`data-id` = `media.attrs.id`)를 우선 쓰고, ADF에 없으면 카드 속성(`data-alt` → `data-file-name`, `data-collection`, `data-type`)으로 descriptor를 만들어 `matchMediaToAttachment`에 넘긴다.

카드를 제거하면 본문 텍스트에서 `Open image (17).png`, `10 Jul 2026, 02:41 PM` 같은 카드 UI 문구도 함께 사라진다.

`resolveMediaInHtml` 실행 순서:

```text
upgradeThumbnailUrlsInHtml   # 썸네일 → content URL
absolutizeAttachmentUrls     # 상대 URL → 절대 URL
replaceMediaCardsInHtml      # media card → 원본 <img>
tagMediaElementsForHydration # data-fishhook-media-url 부착
error span 치환              # [^uuid] → 미디어
```

### fetch 옵션: `includeVideo`

content script → background 메시지:

```text
FISHHOOK_FETCH_JIRA_CONTENT
  issueKey: KEY-123
  includeVideo: true | false   // 기본값 true
```

| `includeVideo` | 동영상 MIME 첨부파일 | Jira rendered `<video>` |
|----------------|----------------------|-------------------------|
| `true` (Objectives) | `<video data-fishhook-media-url="...">` | 유지 + hydration |
| `false` (미리보기) | `[VIDEO]` span | strip → `[VIDEO]` |

### 첨부파일 fetch: `FISHHOOK_FETCH_JIRA_ATTACHMENT`

동영상 hydration은 Fisheye content script에서 Jira URL로 직접 `fetch`하면 CORS에 막히므로, background service worker가 대신 fetch한다.

```text
content/media-loader.js
  -> chrome.runtime.sendMessage({ type: 'FISHHOOK_FETCH_JIRA_ATTACHMENT', url })
background.js
  -> 설정된 Jira 호스트의 attachment URL만 허용
  -> fetch(url, { credentials: 'include' })
  -> arrayBufferToBase64() -> { ok, base64, contentType }
content/media-loader.js
  -> base64ToBlob() -> URL.createObjectURL -> video.src
```

허용 URL 패턴: `{jiraBaseUrl}`과 동일 호스트의 `/rest/api/.../attachment/content/...` 또는 `/secure/attachment/...`

### 바이트는 반드시 문자열로 건넨다

`chrome.runtime.sendMessage`는 MV3에서 **JSON 직렬화**를 쓴다. 구조화 복제가
아니다. `ArrayBuffer`를 그대로 응답에 담으면 content script 쪽에는 `{}`가
도착하고, `new Blob([{}])`은 조용히 15바이트짜리 `"[object Object]"` 문자열이
된다 — 깨진 이미지, `[object Object]`만 보이는 텍스트 미리보기.

그래서 background가 `arrayBufferToBase64()`로 인코딩하고 content script가
`base64ToBlob()`으로 되돌린다. `String.fromCharCode.apply`는 인자가 약 64k를
넘으면 스택이 터지므로 `0x8000` 단위로 끊어서 인코딩한다.

`test/attachment-transfer.test.js`가 이 왕복을 고정한다. 첫 단언이 "ArrayBuffer는
메시지 경계를 넘지 못한다"는 사실 자체를 검증한다.

## content/media-loader.js

`data-fishhook-media-url`이 있는 요소 중 **src가 비어 있는 것**(주로 `<video>`)만 hydration한다.

```javascript
// content script → background → blob URL
chrome.runtime.sendMessage({ type: 'FISHHOOK_FETCH_JIRA_ATTACHMENT', url })
  -> blob -> URL.createObjectURL(blob) -> element.src
```

- **이미지**: `background.js`가 `<img src="{url}">`를 생성하므로 hydration을 건너뛴다.
- **동영상**: src 없이 `data-fishhook-media-url`만 두고 background fetch 후 blob URL을 연결한다.
- Jira에 로그인된 Chrome 세션이 필요하다.
- `<a>` 첨부파일 링크는 href만 절대 URL로 두고 fetch하지 않는다.
- fetch 실패 시 `fishhook-jira-media--failed` 클래스 적용.

## content/image-lightbox.js

Objectives(`.fishhook-objectives-inject`)와 Description 미리보기 패널(`.fishhook-desc-panel__body`) 안의 이미지에 전체화면 확대를 제공한다.

| 동작 | 설명 |
|------|------|
| 클릭 | capture 단계 이벤트로 `<img>` 클릭 → 전체화면 오버레이에 같은 URL 표시 |
| 커서 | 로드된 이미지에 `cursor: zoom-in` |
| 닫기 | `Esc`, 배경 클릭, 우상단 `×` |
| 제외 | `fishhook-jira-media--loading`, `fishhook-jira-media--failed`, src 없는 이미지 |

`FishHookImageLightbox.attach(root, { closeAria })`는 미리보기 본문이 채워질 때 `desc-panel.js` / `fisheye-content.js`에서 호출한다. 리스너는 문서에 한 번만 등록된다.

## description-renderer.js

`render(html, options)` 옵션:

| 옵션 | 값 | 동작 |
|------|-----|------|
| `videoMode` | `'placeholder'` | 모든 `<video>` → `[VIDEO]` span |

미리보기 패널(`desc-panel.js`)에서만 `{ videoMode: 'placeholder' }`를 전달한다.

기타 후처리:

- Jira `span.error` 중 `^` + media id 패턴만 → `[media: ...]` placeholder (background에서 해석되지 않은 경우)
- `^` 패턴이 없는 `span.error`(예: `[snmp0-]`) → placeholder 변환 없이 원문 텍스트로 치환
- `blob:` 이미지 → `[image: 파일명]` placeholder
- `<iframe>` 제거 (외부 embed)

### 인라인 코드

Jira rendered HTML과 plain text 양쪽을 맞춘다.

| 입력 | HTML 출력 |
|------|-----------|
| 본문 텍스트의 `` `text` `` | `<code class="wiki-inline-code">text</code>` |
| 본문 텍스트의 `{{text}}` | `<code class="wiki-inline-code">text</code>` |
| Jira rendered `<tt>` | `wiki-inline-code` 클래스 추가 |
| Jira rendered `<code>`, `<kbd>` (블록 코드 제외) | `wiki-inline-code` 클래스로 통일 |

표 셀 안의 `` `...` `` / `{{...}}`도 동일 규칙으로 변환한다. `pre`·`.code.panel` 안의 코드는 블록 코드로 취급해 인라인 스타일을 적용하지 않는다.

`fisheye-content.css`에서 Cloud Jira 인라인 코드와 비슷하게 스타일한다.

```css
line-height: inherit;
padding-top: 2px;
padding-right: 0.5ch;
padding-bottom: 2px;
color: #292a2e;
white-space: pre-wrap;
background-color: #0515240f;
```

monospace `font-family`·border·border-radius는 사용하지 않고 본문 기본 폰트를 따른다.

## CSS 클래스

| 클래스 | 용도 |
|--------|------|
| `fishhook-media-placeholder` | 이미지/미디어/동영상 placeholder 공통 |
| `fishhook-video-placeholder` | `[VIDEO]` 전용 |
| `fishhook-jira-video` | Objectives 동영상 플레이어 (background fetch 후 blob URL) |
| `fishhook-jira-image` | Jira attachment URL을 src로 직접 표시하는 이미지 |
| `fishhook-jira-media--loading` | src 없는 미디어 fetch 전 shimmer (동영상) |
| `fishhook-jira-media--failed` | fetch 실패 |
| `fishhook-image-lightbox` | 이미지 전체화면 오버레이 |
| `wiki-inline-code` | 인라인 코드 (`code` / `tt` / 백틱·`{{}}` 변환 결과) |

## 제한 사항

- **Jira 로그인 필수**: 이미지 `<img src>`와 동영상 background fetch 모두 Chrome Jira 세션에 의존한다.
- **이미지 vs 동영상 fetch 경로**: 이미지는 `<img src>` 직접 로드, 동영상만 background `FISHHOOK_FETCH_JIRA_ATTACHMENT`를 사용한다. Fisheye origin에서 Jira로 content script fetch는 CORS로 실패한다.
- **대용량 동영상**: 전체 파일을 fetch한 뒤 blob URL로 재생하므로 로딩 시간이 길 수 있다. Range 스트리밍은 지원하지 않는다.
- **Jira Cloud Media Services UUID**: 공개 Media API가 없어 ADF `media.id`(UUID)와 첨부파일 ID가 직접 매칭되지 않을 수 있다. 이 경우 `alt`(파일명) 또는 rendered error span UUID로 매칭을 시도한다.
- **YouTube 등 외부 embed**: `<iframe>`은 보안상 제거한다.

## 관련 파일

```text
background.js                  # ADF/첨부파일 매칭, includeVideo, HTML 보정, attachment fetch
src/adf-html.js                # ADF -> HTML 폴백 (병합 셀 표 복원, docs/adf-table-fallback.md)
content/description-renderer.js
content/media-loader.js        # 동영상 hydration (background 경유)
content/image-lightbox.js      # 이미지 클릭 전체화면
content/desc-panel.js          # includeVideo: false, videoMode: placeholder
content/fisheye-content.js     # Objectives: includeVideo 기본 true, hydration + lightbox
content/fisheye-content.css    # 미디어/placeholder/라이트박스/인라인 코드 스타일
content/desc-panel.css         # 미리보기 패널 이미지 max-width / max-height 420px
```

## 수동 검증 체크리스트

- [ ] Objectives: 동영상 첨부 이슈 → `<video controls>` 재생
- [ ] Objectives: 이미지 첨부 이슈 → 이미지 표시
- [ ] Objectives / 미리보기 패널: 이미지 클릭 → 전체화면 확대, Esc/배경/×로 닫기
- [ ] 미리보기 패널: 동영상 첨부 이슈 → `[VIDEO]`만 표시, 재생 없음
- [ ] 미리보기 패널: 이미지 첨부 이슈 → 이미지 표시 (썸네일 크기가 아닌 원본, 최대 높이 420px)
- [ ] Cloud 에디터 이미지(media card) 이슈 → 카드 UI 문구·다운로드 버튼 없이 이미지만 크게 표시
- [ ] Jira 미로그인 → 동영상 fetch 실패, 이미지 깨짐 가능, 본문 텍스트는 표시
- [ ] Description 본문만 동영상인 이슈 → Objectives/미리보기 모두 빈 화면이 아님
- [ ] Objectives / 미리보기 패널: `` `inline` ``, `{{inline}}`, `<tt>` → Cloud Jira 스타일 인라인 코드 표시
- [ ] `[snmp0-]` 등 대괄호 일반 텍스트 → `[media: ...]` placeholder 없이 원문 표시
