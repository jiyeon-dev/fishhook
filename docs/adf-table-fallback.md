# ADF 표 복원 (rowSpan / colSpan)

## 문제

Cloud Jira에서 **셀 병합(rowspan/colspan)이 있는 표**를 만들면, Objectives·미리보기 패널에 표가 **아예 표시되지 않는다.**

원인은 CSS나 렌더러가 아니라 Jira Cloud API 응답이다. `expand=renderedFields`의 HTML 변환기는 자기가 HTML로 못 바꾸는 ADF 노드를 버리고 **주석 자리표시자**만 남긴다.

```html
<p>본문 머리말입니다.</p>
<!-- ADF macro (type = 'table') -->
```

주석은 화면에 아무것도 그리지 않으므로 표가 사라진다. Jira 웹 화면 DOM에서 복사한 표 HTML(`<table data-testid="renderer-table">…`)은 Jira 프론트엔드가 ADF로 직접 그린 결과이고, 확장이 REST API로 받는 것과 다르다.

## 해결

`fields.description`(원본 ADF)에서 해당 노드를 직접 HTML로 만들어 주석 자리에 끼워 넣는다.

```text
background.js
  -> renderedFields.description  (표 자리에 <!-- ADF macro (type = 'table') --> )
  -> sanitizeHtml
  -> resolveMediaInHtml          (기존 미디어/URL 보정)
  -> restoreAdfMacroPlaceholders (신규: ADF -> HTML 로 표 복원)
  -> content/description-renderer.js
```

### src/adf-html.js

`importScripts('src/adf-html.js')`로 service worker에 로드하고, `test/`에서는 `require()`로 같은 파일을 쓴다.

| export | 설명 |
|--------|------|
| `renderAdfNodeToHtml(node, options)` | ADF 노드 1개 → HTML 문자열 |
| `fillAdfMacroPlaceholders(html, adf, options)` | HTML의 `ADF macro` 주석을 타입이 같은 ADF 노드로 치환 |

`options.renderMedia(mediaNode)`는 호스트(background.js)가 주입한다. `matchMediaToAttachment` → `createMediaElementHtml`로 첨부파일을 찾아 `<img>` / `<video>` / `[VIDEO]`를 만들고, 못 찾으면 `[media: 파일명]` placeholder로 떨어진다. 즉 `includeVideo` 옵션이 복원된 표 안 미디어에도 그대로 적용된다.

치환 규칙:

- 주석은 `<!--\s*ADF macro\s*\(\s*type\s*=\s*'…'\s*\)\s*-->` (쌍따옴표·공백 변형 허용)
- 같은 타입끼리 **문서 순서대로 1:1** 매칭 (표가 여러 개여도 순서 유지)
- ADF에 대응 노드가 없으면 주석을 **그대로 둔다** (임의 추측 금지)
- `html`에 `ADF macro`가 없거나 `adf`가 없으면 그대로 반환 → Server/DC(위키 마크업) 경로는 영향 없음

### 표 변환 규칙

| ADF | HTML |
|-----|------|
| `table` | `<table class="wiki-table" data-fishhook-adf-table="true"><tbody>` |
| `tableRow` | `<tr>` |
| `tableHeader` / `tableCell` | `<th>` / `<td>` |
| `attrs.colspan` / `attrs.rowspan` | `colspan` / `rowspan` (**값이 1이면 생략**) |
| `attrs.background` | `style="background-color:…"` (`#rgb`·`rgb()` 형태만 허용) |
| `attrs.colwidth` | **버린다** (아래 참고) |

`colwidth`를 버리는 이유: Jira 편집기 폭(약 1300px) 기준 픽셀 값이라, 480px 미리보기 패널에 그대로 넣으면 첫 열이 60px 이하로 짓눌려 글자 단위로 줄바꿈된다. `table-layout: auto`에 맡긴다.

표 밖의 노드도 같은 변환기를 쓰므로 셀 안의 문단·목록·코드블록·미디어·링크·마크(`strong`/`em`/`code`/`link`/`textColor` 등)가 함께 복원된다. 모르는 노드 타입은 내용만 재귀적으로 렌더링해 텍스트가 사라지지 않게 한다.

보안: 텍스트·속성은 모두 이스케이프하고, `href`는 `http(s):` / `mailto:` / `tel:` / `/`만 허용한다.

### CSS

`content/fisheye-content.css`

- `td > p` / `th > p` 기본 margin 제거 (ADF 셀은 내용을 `<p>`로 감싼다)
- `colgroup` / `col`에 `display: table-column-group` / `table-column` 강제 — 이 시트가 `table`·`tr`·`td`의 display를 `!important`로 덮는데 `colgroup`·`col`만 빠져 있어 호스트(Fisheye) CSS가 열 구조를 무너뜨릴 수 있었다.

## 테스트

```bash
node --test test/adf-html.test.js test/background-integration.test.js
```

- `test/adf-html.test.js` — 변환기 단위 테스트 (병합 셀, 마크, 이스케이프, 자리표시자 치환 순서)
- `test/background-integration.test.js` — 실제 `background.js`를 service worker 셰임에 올려 `parseIssueDescription` 결과 검증

## 제한 사항

- **패널이 좁으면 텍스트 열이 여전히 좁다.** 작성자가 Jira에서 첫 열을 전체 폭의 13% 정도로 잡고, 나머지 열에 500px 이상 이미지를 넣은 경우 480px 패널에서는 어쩔 수 없다. 패널 좌상단 핸들로 넓히면 해소된다.
- **`renderedFields`가 아예 비어 있는 경우**는 기존 ADF 평문 폴백([background.js](../background.js) `parseIssueDescription` 마지막 분기)을 그대로 쓴다. 이 경로는 표를 평문으로 납작하게 만든다.
- 표 외 다른 `ADF macro` 타입(`expand`, `panel`, `layoutSection` 등)도 ADF에 노드가 있으면 같은 방식으로 복원되지만, 실제 Jira가 어떤 타입에 자리표시자를 내는지는 인스턴스마다 다를 수 있다.

## 수동 검증 체크리스트

- [ ] Cloud Jira: `rowspan`/`colspan` 있는 표 → Objectives·미리보기 모두에 표 표시
- [ ] 병합 셀 안 이미지 → 표시되고 클릭 시 전체화면
- [ ] 미리보기 패널: 병합 표 안 동영상 → `[VIDEO]`만 표시
- [ ] 병합 없는 일반 표 → 기존과 동일하게 표시 (회귀 없음)
- [ ] Server/DC(위키 마크업) 이슈 → 기존과 동일
