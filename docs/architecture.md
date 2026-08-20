# fishhook 구조

현재 구현된 동작을 기준으로 한 문서다. 초기 설계 단계의 하네스 계획
(`harness-engineering-plan.md`)은 구현이 끝나 폐기했다 — 필요하면 git 히스토리에 있다.

## 전체 흐름

```text
Fisheye 리뷰 페이지 (/cru/...)
  content/fisheye-content.js
    -> 저장된 Fisheye origin과 현재 origin 비교
    -> Objectives heading 탐색 -> 아이콘 버튼 삽입
    -> 제목/링크/query에서 Jira issue key 추출
    -> chrome.runtime.sendMessage(FISHHOOK_FETCH_JIRA_CONTENT)

  background.js (service worker)
    -> 저장된 Jira origin + 브라우저 Jira 세션
    -> GET /rest/api/{3|2|latest}/issue/{KEY}
         ?fields=summary,description,attachment,project,issuetype,status,fixVersions,versions
         &expand=renderedFields
    -> renderedFields.description 후처리 (sanitize -> 미디어 해석 -> ADF 폴백)
    -> { ok, html/text, issueTitle, issueType, status, fixVersions, affectsVersions,
         attachments }

  content/description-renderer.js  -> 코드블록/인라인 코드/placeholder 보정
  content/media-loader.js          -> <video> hydration (background 경유 blob URL)
  content/image-lightbox.js        -> 클릭 전체화면 오버레이 (이미지/PDF/텍스트)
  content/attachment-list.js       -> 본문 하단 첨부파일 목록 + 타입별 미리보기
  content/issue-meta.js            -> 이슈 타입/상태/Fix·Affects versions 줄 (배너·패널 공용)
    -> Objectives 영역 주입 또는 우측 하단 패널 렌더
```

API 버전은 `3` → `2` → `latest` 순으로 시도한다. Cloud와 Server/DC를 한 코드로
지원하기 위해서다.

## 표시 위치 두 가지

| | Objectives 주입 | Description 미리보기 패널 |
|---|---|---|
| 진입 | Objectives 라벨 우측 아이콘 버튼 | 툴바 팝업 / 우측 하단 FAB |
| 요청 옵션 | `includeVideo: true` | `includeVideo: false` |
| 렌더 옵션 | 기본 | `videoMode: 'placeholder'` |
| 동영상 | `<video controls>` 재생 | `[VIDEO]` placeholder |
| 이미지 | `<img src>` + 클릭 확대 | 동일 (최대 높이 420px) |
| 원복 | 원래 Objectives 본문 복원 가능 | 패널 닫기 |

첨부파일 목록은 두 위치 모두 본문 맨 아래에 같은 모양으로 붙는다.

설계 상세: [objectives-icon-button-design.md](./objectives-icon-button-design.md),
미디어 규칙: [jira-media-handling.md](./jira-media-handling.md),
첨부파일 목록: [attachment-list-design.md](./attachment-list-design.md)

## 메시지 계약

| 타입 | 방향 | 필드 |
|------|------|------|
| `FISHHOOK_FETCH_JIRA_CONTENT` | content → background | `issueKey`, `includeVideo` |
| `FISHHOOK_FETCH_JIRA_ATTACHMENT` | content → background | `url` → `{ ok, base64, contentType }` |
| `FISHHOOK_SHOW_DESCRIPTION_PREVIEW` | popup → content | — |

fetch 실패 코드: `INVALID_ISSUE_KEY`, `JIRA_URL_NOT_CONFIGURED`,
`JIRA_LOGIN_REQUIRED`, `DESCRIPTION_NOT_FOUND`.

`401`/`403` 응답, 또는 JSON이 아닌 로그인 HTML 응답은 모두
`JIRA_LOGIN_REQUIRED`로 취급한다.

## Description HTML 파이프라인

`background.js` `parseIssueDescription`:

```text
renderedFields.description
  -> sanitizeHtml                  # script/iframe/이벤트 핸들러 제거
  -> restoreColorMarks             # Jira 색상 마크 -> 인라인 color/background-color
  -> resolveMediaInHtml            # 썸네일→원본, 상대→절대, media card, error span
  -> restoreAdfMacroPlaceholders   # <!-- ADF macro (type='table') --> -> ADF에서 복원
  -> restoreCascadedCodeFences / restoreSplitCodeBlocks
  -> replaceWikiMangledHtml        # 위키 마크업이 새어나오면 문서 전체를 ADF에서 재렌더
  -> restoreAdfTableWidths         # 모든 표에 ADF 열 폭을 <colgroup>으로 복원
  -> (본문이 비면) ADF 평문 폴백
```

이후 content script의 `description-renderer.js`가 코드 블록을 Fisheye 스타일
code panel로 바꾸고, 인라인 코드(`` ` ``, `{{}}`, `<tt>`)를 통일하고,
남은 `<video>`를 패널에서 `[VIDEO]`로 교체한다.

상세: [adf-table-fallback.md](./adf-table-fallback.md), [jira-media-handling.md](./jira-media-handling.md)

## 권한

```json
"permissions": ["storage", "scripting", "tabs"],
"host_permissions": ["http://*/*", "https://*/*"]
```

Jira REST 호출과 첨부파일 fetch 모두 이 host permission + 브라우저 Jira 세션에
의존한다. 실제 동작은 저장된 Fisheye origin에서만 활성화된다 — 다른 사이트에서는
content script가 아무것도 삽입하지 않는다.

## 이슈 키 추출 규칙

- 리뷰 제목 첫머리의 `KEY-123`
- 제목 링크 href의 `/browse/KEY-123`
- query string의 `?key=KEY-123`
- `RGS-6759` 같은 Fisheye 리뷰 키는 **제외**한다.

Objectives heading은 다음 순서로 찾는다.

1. 텍스트가 `Objectives`로 시작하는 `h4.overview-heading`
2. 주변에 `#objectives-markup`이 있는 heading
3. `a.edit-objectives`를 포함한 overview heading

저장된 Fisheye 페이지인데도 못 찾으면 `console.info`로 진단 로그를 남긴다.
다른 사이트에서는 로그를 남기지 않는다.

## 테스트

```bash
node --test
```

| 파일 | 범위 |
|------|------|
| `test/adf-html.test.js` | ADF → HTML 변환기 (병합 셀, 마크, 색상 마크 번역, 이스케이프, 자리표시자 치환) |
| `test/background-integration.test.js` | 실제 `background.js`를 셰임에 올려 `parseIssueDescription` 검증 |
| `test/attachment-matching.test.js` | ADF media ↔ 첨부파일 매칭 6단계 |
| `test/attachment-list-parse.test.js` | `parseAttachmentList` — Cloud/Server content URL, 결측값 |
| `test/attachment-list.test.js` | 첨부 목록 HTML 빌더, 타입 분류, 크기·날짜 포맷 |
| `test/attachment-transfer.test.js` | 첨부 바이트의 base64 왕복 (메시지 경계 JSON 직렬화) |
| `test/media-images.test.js` | 썸네일 승격, media card 치환, `includeVideo` |
| `test/issue-versions.test.js` | fixVersions / affectsVersions / issueType / status 파싱 |
| `test/issue-meta.test.js` | 이슈 메타 줄 HTML 빌더 (타입·상태 lozenge·버전 태그, 이스케이프) |

UI(Objectives 주입, 패널, 라이트박스)는 자동 테스트가 없다. 각 문서 하단의
수동 검증 체크리스트로 확인한다.
