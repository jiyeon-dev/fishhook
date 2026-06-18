# Jira 미디어(이미지·동영상) 처리

## 목적

Jira Description에 포함된 인라인 첨부파일(이미지, 동영상)을 Fisheye에서 보여줄 때 발생하는 문제를 해결한다.

Jira REST API의 `expand=renderedFields` 응답은 미디어를 제대로 HTML로 변환하지 못하는 경우가 많다.

```html
<span class="error">[^524f6d51-e4fb-475b-9122-24e283d1a95f]</span>
```

또한 첨부파일 URL이 `/rest/api/3/attachment/content/123` 같은 상대 경로이고, Fisheye 페이지에서는 Jira 인증 쿠키가 붙지 않아 `<video src>` / `<img src>`로 직접 로드할 수 없다.

## 표시 위치별 동작

| 표시 위치 | 이미지 | 동영상 |
|-----------|--------|--------|
| Objectives 불러오기 | 인증 fetch 후 blob URL로 표시 | `<video controls>` 재생 |
| Description 미리보기 패널 / popup | 인증 fetch 후 blob URL로 표시 | **`[VIDEO]`** 플레이스홀더만 표시 |
| Jira에서 blob URL 이미지 | `[image: 파일명]` 플레이스홀더 | — |
| 외부 embed (iframe) | 표시하지 않음 | 표시하지 않음 |

미리보기 패널에서는 동영상 스트리밍·레이아웃 이슈를 피하기 위해 재생하지 않는다.
Objectives 영역에서만 동영상을 재생한다.

## 처리 흐름

```text
background.js
  -> Jira REST API (fields=summary,description,attachment, expand=renderedFields)
  -> ADF media 노드 + 첨부파일 목록 매칭
  -> rendered HTML의 error span / 상대 URL 보정
  -> includeVideo 옵션에 따라 동영상 태그 또는 [VIDEO] placeholder 생성

content/description-renderer.js
  -> sanitize, code block 변환, table/inline code 보정
  -> videoMode=placeholder 이면 남은 <video>를 [VIDEO]로 교체

content/media-loader.js
  -> [data-fishhook-media-url] 요소를 credentials 포함 fetch
  -> blob URL 생성 후 src에 설정 (이미지·Objectives 동영상)
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
3. `attrs.alt`와 첨부파일 `filename` 일치
4. media `id`와 첨부파일 `id` 일치

### HTML 후처리

- `<span class="error">[^uuid]</span>` → 매칭된 첨부파일 MIME에 따라 `<video>`, `<img>`, `<a>` 또는 placeholder
- `/rest/api/.../attachment/content/...` 상대 URL → `{jiraBaseUrl}` 절대 URL
- 기존 `<video>` / `<img>` src → `data-fishhook-media-url` 속성 추가

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

## content/media-loader.js

`data-fishhook-media-url`이 있는 `<video>`, `<img>` 요소에 대해:

```javascript
fetch(url, { credentials: 'include', redirect: 'follow' })
  -> blob -> URL.createObjectURL(blob) -> element.src
```

- Jira에 로그인된 Chrome 세션이 필요하다.
- `<a>` 첨부파일 링크는 href만 절대 URL로 두고 fetch하지 않는다.
- fetch 실패 시 `fishhook-jira-media--failed` 클래스 적용.

## description-renderer.js

`render(html, options)` 옵션:

| 옵션 | 값 | 동작 |
|------|-----|------|
| `videoMode` | `'placeholder'` | 모든 `<video>` → `[VIDEO]` span |

미리보기 패널(`desc-panel.js`)에서만 `{ videoMode: 'placeholder' }`를 전달한다.

기타 후처리:

- Jira `span.error` → `[media: ...]` placeholder (background에서 해석되지 않은 경우)
- `blob:` 이미지 → `[image: 파일명]` placeholder
- `<iframe>` 제거 (외부 embed)

## CSS 클래스

| 클래스 | 용도 |
|--------|------|
| `fishhook-media-placeholder` | 이미지/미디어/동영상 placeholder 공통 |
| `fishhook-video-placeholder` | `[VIDEO]` 전용 |
| `fishhook-jira-video` | Objectives 동영상 플레이어 |
| `fishhook-jira-image` | 인증 fetch 후 표시되는 이미지 |
| `fishhook-jira-media--loading` | fetch 전 shimmer |
| `fishhook-jira-media--failed` | fetch 실패 |

## 제한 사항

- **Jira 로그인 필수**: 미디어 fetch는 extension `host_permissions` + `credentials: 'include'`에 의존한다.
- **대용량 동영상**: 전체 파일을 fetch한 뒤 blob URL로 재생하므로 로딩 시간이 길 수 있다. Range 스트리밍은 지원하지 않는다.
- **Jira Cloud Media Services UUID**: 공개 Media API가 없어 ADF `media.id`(UUID)와 첨부파일 ID가 직접 매칭되지 않을 수 있다. 이 경우 `alt`(파일명) 또는 rendered error span UUID로 매칭을 시도한다.
- **YouTube 등 외부 embed**: `<iframe>`은 보안상 제거한다.

## 관련 파일

```text
background.js                  # ADF/첨부파일 매칭, includeVideo, HTML 보정
content/description-renderer.js
content/media-loader.js
content/desc-panel.js          # includeVideo: false, videoMode: placeholder
content/fisheye-content.js     # Objectives: includeVideo 기본 true, hydration
content/fisheye-content.css    # 미디어/placeholder 스타일
content/desc-panel.css         # 미리보기 패널 이미지 max-width
```

## 수동 검증 체크리스트

- [ ] Objectives: 동영상 첨부 이슈 → `<video controls>` 재생
- [ ] Objectives: 이미지 첨부 이슈 → 이미지 표시
- [ ] 미리보기 패널: 동영상 첨부 이슈 → `[VIDEO]`만 표시, 재생 없음
- [ ] 미리보기 패널: 이미지 첨부 이슈 → 이미지 표시
- [ ] Jira 미로그인 → 미디어 fetch 실패, 본문 텍스트는 표시
- [ ] Description 본문만 동영상인 이슈 → Objectives/미리보기 모두 빈 화면이 아님
