# 첨부파일 목록

Jira 이슈의 첨부파일을 본문 맨 아래에 목록으로 보여주고, 클릭하면 타입에 따라
미리보기를 띄우거나 다운로드한다.

## 왜 필요한가

`attachment` 필드는 원래부터 가져오고 있었지만 **ADF media ↔ 첨부파일 매칭**에만
썼다 — 본문 안의 이미지/동영상을 원본 URL로 바꿔치기하는 용도
([jira-media-handling.md](./jira-media-handling.md)). 본문에 인라인으로 박히지
않은 첨부파일(`.md`, `.log`, `.xlsx` 등)은 Fisheye 화면 어디에도 나타나지 않았다.

## 표시 규칙

첨부파일이 하나라도 있으면 본문 마지막에 다음을 붙인다.

```html
<hr class="fishhook-attachments__rule">
<div class="fishhook-attachments">
  <div class="fishhook-attachments__title">첨부파일 (7)</div>
  <ul class="fishhook-attachments__list">
    <li class="fishhook-attachments__item">
      <button class="fishhook-attachments__link" data-fishhook-attachment-…>
        <span class="fishhook-attachments__icon">📄</span>
        <span class="fishhook-attachments__name">파일명.md</span>
      </button>
      <span class="fishhook-attachments__meta">20 KB · 2026-07-31</span>
    </li>
  </ul>
</div>
```

- **전부 나열한다.** 본문에 이미 인라인으로 렌더된 스크린샷·동영상도 목록에
  남긴다. 이 목록의 목적이 "빠뜨린 첨부가 없나" 확인이라 완전성이 우선이고,
  인라인 매칭이 실패했을 때 목록에서도 조용히 사라지는 이중 실패를 막는다.
- 첨부가 0개면 `<hr>`을 포함해 **아무것도 그리지 않는다**.
- 정렬은 Jira REST가 준 순서 그대로다. 별도 정렬을 하지 않는다.
- 날짜는 Jira가 준 ISO 문자열의 앞 10자를 그대로 쓴다. `new Date()`로 파싱하면
  보는 사람의 타임존에 따라 하루가 밀린다.
- 크기가 없으면(`size: null`) 크기 없이 날짜만 보여준다. 둘 다 없으면 메타 칸
  자체를 그리지 않는다.
- 파일명과 크기·날짜 사이는 `.fishhook-attachments__meta`의 `margin-left`로 띄운다.

### 항목 레이아웃을 flex/grid로 바꾸지 마라

Objectives 주입 경로에서 이 목록은 `.fishhook-objectives-body--adf` **안에**
그려진다. 그 컨테이너의 ADF 목록 복원 규칙이 이미
`li { display: list-item !important }`를 걸어둔다 — Fisheye 자체 스타일시트를
이기려고 붙인 것이다.

여기서 `!important`를 맞붙여도 소용없다. **`!important`끼리 만나면 명시도가 다시
승부를 가른다.** `.fishhook-objectives-body--adf li`는 (0,1,1)이고
`.fishhook-attachments__item`은 (0,1,0)이라 ADF 규칙이 계속 이긴다. 그래서 항목에
`display: flex`나 `display: grid`를 줘도 **적용되지 않고**, 거기 매달린
`gap` / `column-gap`도 전부 무효가 된다.

항목은 평범한 인라인 흐름 `list-item`으로 두고 간격은 **margin**으로 준다.
이 흐름에서는 인라인 요소에도 좌우 margin이 정상 적용된다.

Description 패널은 `--adf` 바깥에 붙어서 이 제약이 없다 — **패널에서만 확인하면
레이아웃이 멀쩡해 보인다.** 목록 스타일을 고쳤으면 반드시 Objectives 쪽에서 본다.
- 파일명은 이스케이프한다. Jira 첨부 파일명은 사용자 입력이다.

표시 위치는 **Objectives 주입과 Description 패널 둘 다**다. 두 경로가 같은 렌더
파이프라인을 쓰므로 분기하지 않는다. 패널은 폭이 좁아 크기·날짜가 줄바꿈된다.

## 타입 분류

`content/attachment-list.js`의 `classify()`가 네 종류로 나눈다.

| 종류 | 판정 | 아이콘 | 클릭 동작 |
|------|------|--------|-----------|
| `image` | MIME `image/*` 또는 확장자 `png/jpg/jpeg/gif/webp/bmp/svg/avif` | 🖼️ | 라이트박스에 `<img>` |
| `pdf` | MIME `application/pdf` 또는 확장자 `pdf` | 📕 | 라이트박스에 `<iframe>` |
| `text` | 확장자가 텍스트 목록에 있거나 MIME `text/*`, `application/json`, `application/xml` | 📄 | 라이트박스에 `<pre>` 원문 |
| `download` | 그 외 | 📦 | 파일 다운로드 |

이미지 아이콘만 변형 선택자(`U+FE0F`)를 달고 있다. `U+1F5BC` 단독은 Windows에서
흑백 글리프로 떨어져 나머지 셋과 톤이 안 맞는다.

**확장자를 MIME보다 넓게 본다.** Jira Cloud는 `.md`, `.log` 업로드를
`application/octet-stream`으로 저장하는 경우가 많아서, MIME만 믿으면 대부분의
텍스트 첨부가 `download`로 떨어진다.

`text`는 **마크다운 렌더를 하지 않는다.** 저장소에 마크다운 파서가 없고
([src/adf-html.js](../src/adf-html.js)는 ADF 전용), 원문을 보여주면 `.md`,
`.log`, `.diff`가 전부 같은 경로로 처리된다. UTF-8로 디코드한다.

2MB를 넘는 `text`는 미리보기 대신 다운로드한다.

## 데이터 흐름

```text
background.js parseAttachmentList(json, jiraBaseUrl)
  -> [{ id, filename, url, mimeType, size, created }]
  -> meta에 실려 FISHHOOK_FETCH_JIRA_CONTENT 응답의 attachments로 전달

content/attachment-list.js build(attachments, labels) -> HTML 문자열
  -> fisheye-content.js renderJiraBody()  (Objectives)
  -> desc-panel.js fillBody()             (패널)

클릭 -> attach()가 위임 처리
  -> FishHookMediaLoader.fetchBlob(url)   (background 프록시, CORS 우회)
  -> FishHookImageLightbox.openNode(node) (image/pdf/text)
     또는 <a download> 트리거            (download)
```

`url`은 `attachmentContentUrl()`이 만든다. Cloud는 `content`가 전체 URL,
Server/DC는 `/secure/attachment/...` 상대 경로라 양쪽 다 절대 URL로 정규화된다.
`content`가 없으면 id로 `/rest/api/3/attachment/content/{id}`를 만든다.

`media-cdn.atlassian.com` 토큰 URL은 **쓰지 않는다.** Jira 화면이 썸네일에 쓰는
URL이지만 서명 토큰에 만료가 있다. REST content 경로는 세션 쿠키만으로 동작하고
만료가 없다.

## 라이트박스 일반화

`content/image-lightbox.js`가 이미지 전용에서 범용 오버레이가 됐다.

- 오버레이 안에 `.fishhook-image-lightbox__stage`가 생겼고, 이미지든 iframe이든
  `<pre>`든 이 stage에 들어간다. 닫기(ESC / 배경 클릭 / ×)는 하나로 통일된다.
- `openNode(node, { label, onClose })`가 추가됐다. `onClose`는 미리보기용으로
  만든 blob URL을 해제하는 데 쓴다 — 오버레이를 닫을 때 한 번 호출된다.
- 본문 이미지 클릭 경로(`attach` → 캡처 단계 클릭 가로채기)는 그대로다.

**PDF는 페이지 CSP에 막힐 수 있다.** Fisheye 페이지의 `frame-src`가 `blob:`을
허용하지 않으면 iframe이 비어 보인다. 그래서 PDF 미리보기 상단 바에 "새 탭에서
열기" 링크를 항상 둔다. 이게 폴백이다.

## 보안

- 첨부 바이트는 **base64 문자열**로 메시지 경계를 넘는다. `ArrayBuffer`를 그대로
  담으면 JSON 직렬화에 뭉개져 `[object Object]`가 된다 —
  [jira-media-handling.md](./jira-media-handling.md) 참고.
- 첨부 바이트는 기존 `FISHHOOK_FETCH_JIRA_ATTACHMENT` 프록시로만 가져온다.
  background의 `isAllowedJiraAttachmentUrl()`이 **저장된 Jira 호스트의 attachment
  경로만** 허용한다 — 이 기능이 그 제약을 넓히지 않는다.
- 텍스트 미리보기는 `pre.textContent`로 넣는다. `innerHTML`을 쓰지 않는다.
- 목록 HTML은 문자열로 만들지만 파일명·MIME은 전부 `escapeHtml`을 거친다.

## 수동 검증 체크리스트

- [ ] 첨부가 여러 개인 이슈: 본문 끝에 가로줄과 `첨부파일 (n)` 목록이 뜬다
- [ ] 첨부가 없는 이슈: 가로줄도 제목도 안 뜬다
- [ ] 본문에 인라인으로 보이는 스크린샷이 목록에도 그대로 있다
- [ ] `.md` 클릭 → 라이트박스에 원문 텍스트, 한글이 안 깨진다
- [ ] `.png` 클릭 → 라이트박스에 원본 크기 이미지
- [ ] `.pdf` 클릭 → 라이트박스에 PDF 뷰어. 안 보이면 "새 탭에서 열기"로 열린다
- [ ] `.zip` / `.xlsx` 클릭 → 오버레이 없이 다운로드가 시작된다
- [ ] ESC / 배경 클릭 / × 로 미리보기가 닫힌다
- [ ] 미리보기를 닫았다가 다른 파일을 열어도 이전 내용이 남지 않는다
- [ ] **Objectives 주입 화면에서** 파일명과 크기·날짜 사이가 벌어져 있다
      (패널만 보면 놓친다 — 위 레이아웃 절 참고)
- [ ] 파일명이 아주 긴 첨부: 목록이 가로로 넘치지 않고 줄바꿈된다
- [ ] Description 패널(FAB)에서도 목록이 보이고, 좁은 폭에서 메타가 줄바꿈된다
- [ ] Jira 로그아웃 상태에서 첨부 클릭 → 오류 토스트가 뜬다
- [ ] 언어를 `ko` / `en`으로 바꾸면 제목과 "새 탭에서 열기"가 함께 바뀐다
- [ ] Objectives "원본 보기" 버튼으로 복원하면 목록도 같이 사라진다
